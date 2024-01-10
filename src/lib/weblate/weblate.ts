import axios, {isAxiosError} from 'axios';
import type {AxiosInstance} from 'axios';
import type {
    Category,
    Component,
    ComponentRepository,
    ComponentTranslationStats,
    Paginated,
} from './types';
import {normalizeResponse, slugify} from './normalizers';
import {sleep} from '../../utils';
declare module 'axios' {
    interface AxiosResponse<T = any> extends Promise<T> {}
}

const DEFAULT_COMPONENT_ADDONS = [
    {
        name: 'weblate.git.squash',
        configuration: {
            squash: 'all',
        },
    },
    {
        name: 'weblate.flags.target_edit',
    },
    {name: 'weblate.flags.source_edit'},
    {name: 'weblate.flags.same_edit'},
    {name: 'weblate.gravity.custom'},
];

const getComponentSlug = ({
    name,
    categorySlug,
}: {
    name: string;
    categorySlug?: string;
}) => {
    const slug = slugify(name);

    return encodeURIComponent(
        categorySlug ? `${categorySlug}%2F${slug}` : slug,
    );
};

interface WeblateConstructorArg {
    serverUrl: string;
    token: string;
    project: string;
    fileFormat: string;
}

export class Weblate {
    private serverUrl: string;
    private project: string;
    private fileFormat: string;
    private client: AxiosInstance;

    constructor({
        serverUrl,
        token,
        project,
        fileFormat,
    }: WeblateConstructorArg) {
        this.serverUrl = serverUrl;
        this.project = project;
        this.fileFormat = fileFormat;

        this.client = axios.create({
            baseURL: serverUrl,
            headers: {
                Authorization: `Token ${token}`,
            },
        });

        this.client.interceptors.response.use(normalizeResponse);
    }

    async createCategoryForBranch(branchName: string) {
        const category = await this.findCategoryForBranch(branchName);

        if (category) {
            return category;
        }

        const createdCategory = await this.client.post<Category>(
            '/api/categories/',
            {
                project: `${this.serverUrl}/api/projects/${this.project}/`,
                name: branchName,
                slug: slugify(branchName),
            },
        );

        return {
            ...createdCategory,
            wasRecentlyCreated: true,
        };
    }

    async findCategoryForBranch(branchName: string) {
        let category: Category | undefined;
        let page = 1;

        while (!category) {
            const {next, results} = await this.client.get<Paginated<Category>>(
                `/api/projects/${this.project}/categories/`,
                {
                    params: {page},
                },
            );

            category = results.find(({name}) => name === branchName);

            if (next) {
                page = next;
            } else {
                break;
            }
        }

        return category;
    }

    async createComponent({
        name,
        fileMask,
        source,
        repo,
        branch,
        categoryId,
        categorySlug,
        repoForUpdates,
        branchForUpdates,
        applyDefaultAddons = true,
        updateIfExist,
    }: {
        name: string;
        fileMask: string;
        source: string;
        repo: string;
        branch?: string;
        categoryId?: string;
        categorySlug?: string;
        repoForUpdates?: string;
        branchForUpdates?: string;
        applyDefaultAddons?: boolean;
        updateIfExist?: boolean;
    }) {
        const component = await this.findComponent({name, categorySlug});

        if (component) {
            if (updateIfExist) {
                await this.updateComponent({
                    name,
                    categorySlug,
                    repo,
                    branch,
                    branchForUpdates,
                    fileMask,
                });

                if (applyDefaultAddons) {
                    await this.applyDefaultAddonsToComponent({
                        name,
                        categorySlug,
                    });
                }

                return {
                    ...component,
                    repo,
                    branch,
                };
            }

            return component;
        }

        const createdComponent = await this.client.post<Component>(
            `/api/projects/${this.project}/components/`,
            {
                name,
                slug: slugify(name),
                source_language: {code: 'en', name: 'English'},
                file_format: this.fileFormat,
                filemask: fileMask,
                language_regex: '^..$',
                vcs: 'github',
                repo,
                push: repoForUpdates,
                push_branch: repoForUpdates
                    ? branchForUpdates || branch
                    : undefined,
                branch,
                category: categoryId
                    ? `${this.serverUrl}/api/categories/${categoryId}/`
                    : undefined,
                template: source,
                new_base: source,
                allow_translation_propagation: false,
                manage_units: false,
                merge_style: 'merge',
            },
        );

        if (applyDefaultAddons) {
            await this.applyDefaultAddonsToComponent({name, categorySlug});
        }

        return {
            ...createdComponent,
            wasRecentlyCreated: true,
        };
    }

    async findComponent({
        name,
        categorySlug,
    }: {
        name: string;
        categorySlug?: string;
    }) {
        const componentSlug = getComponentSlug({name, categorySlug});

        try {
            return await this.client.get<Component>(
                `/api/components/${this.project}/${componentSlug}/`,
            );
        } catch (error) {
            if (isAxiosError(error) && error.response?.status === 404) {
                return undefined;
            }
            throw error;
        }
    }

    async updateComponent({
        name,
        categorySlug,
        repo,
        branch,
        repoForUpdates,
        branchForUpdates,
        fileMask,
    }: {
        name: string;
        categorySlug?: string;
        repo: string;
        branch?: string;
        repoForUpdates?: string;
        branchForUpdates?: string;
        fileMask?: string;
    }) {
        const componentSlug = getComponentSlug({name, categorySlug});

        try {
            return await this.client.put<Component>(
                `/api/components/${this.project}/${componentSlug}/`,
                {
                    name,
                    slug: slugify(name),
                    filemask: fileMask,
                    language_regex: '^..$',
                    file_format: this.fileFormat,
                    repo,
                    push: repoForUpdates,
                    push_branch: repoForUpdates
                        ? branchForUpdates || branch
                        : undefined,
                    branch,
                },
            );
        } catch (error) {
            if (isAxiosError(error) && error.response?.status === 404) {
                return undefined;
            }
            throw error;
        }
    }

    removeComponent({
        name,
        categorySlug,
    }: {
        name: string;
        categorySlug?: string;
    }) {
        const componentSlug = getComponentSlug({name, categorySlug});

        return this.client.delete(
            `/api/components/${this.project}/${componentSlug}/`,
        );
    }

    async getComponentsInCategory({categoryId}: {categoryId: string}) {
        const components: Component[] = [];
        let page = 1;

        while (page) {
            const {next, results} = await this.client.get<Paginated<Component>>(
                `/api/projects/${this.project}/components/`,
                {
                    params: {page},
                },
            );

            components.push(
                ...results.filter(({category}) => category === categoryId),
            );

            if (next) {
                page = next;
            } else {
                break;
            }
        }

        return components;
    }

    pullComponentRemoteChanges({
        name,
        categorySlug,
    }: {
        name: string;
        categorySlug?: string;
    }) {
        const componentSlug = getComponentSlug({name, categorySlug});

        return this.client.post(
            `/api/components/${this.project}/${componentSlug}/repository/`,
            {operation: 'pull'},
        );
    }

    async getComponentTranslationsStats({
        name,
        categorySlug,
    }: {
        name: string;
        categorySlug?: string;
    }) {
        const componentSlug = getComponentSlug({name, categorySlug});

        return (
            await this.client.get<Paginated<ComponentTranslationStats>>(
                `/api/components/${this.project}/${componentSlug}/statistics/`,
            )
        ).results;
    }

    async applyDefaultAddonsToComponent({
        name,
        categorySlug,
    }: {
        name: string;
        categorySlug?: string;
    }) {
        const componentSlug = getComponentSlug({name, categorySlug});

        const promises = DEFAULT_COMPONENT_ADDONS.map(addon =>
            this.client.post(
                `/api/components/${this.project}/${componentSlug}/addons/`,
                {name: addon.name, configuration: addon.configuration},
            ),
        );

        try {
            await Promise.all(promises);
        } catch (error) {
            // Ignore error like 'Add-on already installed'
            if (
                !isAxiosError(error) ||
                !error.response?.data ||
                !('name' in error.response.data)
            ) {
                throw error;
            }
        }
    }

    async getAddonName(id: string) {
        return (await this.client.get<{name: string}>(`/api/addons/${id}/`))
            .name;
    }

    getComponentRepository({
        name,
        categorySlug,
    }: {
        name: string;
        categorySlug?: string;
    }) {
        const componentSlug = getComponentSlug({name, categorySlug});

        return this.client.get<ComponentRepository>(
            `/api/components/${this.project}/${componentSlug}/repository/`,
        );
    }

    async isComponentTaskCompleted({
        name,
        categorySlug,
    }: {
        name: string;
        categorySlug?: string;
    }) {
        const component = await this.findComponent({name, categorySlug});

        if (!component?.task_url) {
            return true;
        }

        return (
            await this.client.get<{completed: boolean}>(
                `/api/tasks/${component.task_url}/`,
            )
        ).completed;
    }

    async waitComponentsTasks({
        componentNames,
        categorySlug,
    }: {
        componentNames: string[];
        categorySlug?: string;
    }) {
        const maxTries = 20;
        const sleepTime = 10000;
        let tries = 0;

        while (tries < maxTries) {
            const locks = await Promise.all(
                componentNames.map(name =>
                    this.isComponentTaskCompleted({name, categorySlug}),
                ),
            );

            if (locks.every(Boolean)) {
                return;
            }

            tries++;
            await sleep(sleepTime);
        }

        throw new Error(
            `Long wait for unlocking components in category '${categorySlug}'`,
        );
    }
}
