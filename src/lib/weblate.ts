import axios, {isAxiosError} from 'axios';
import type {AxiosInstance} from 'axios';
import type {Category, Component, Paginated} from './types';
import {getSlugForBranch, normalizeResponse} from './normalizers';

declare module 'axios' {
    interface AxiosResponse<T = any> extends Promise<T> {}
}

interface WeblateConstructorArg {
    serverUrl: string;
    token: string;
    project: string;
}

export class Weblate {
    private serverUrl: string;
    private project: string;
    private client: AxiosInstance;

    constructor({serverUrl, token, project}: WeblateConstructorArg) {
        this.serverUrl = serverUrl;
        this.project = project;

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

        return this.client.post<Category>('/api/categories/', {
            project: `${this.serverUrl}/api/projects/${this.project}/`,
            name: branchName,
            slug: getSlugForBranch(branchName),
        });
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
    }: {
        name: string;
        fileMask: string;
        source: string;
        repo: string;
        branch?: string;
        categoryId?: string;
        categorySlug?: string;
        repoForUpdates?: string;
    }) {
        const component = await this.findComponent({name, categorySlug});

        if (component) {
            return component;
        }

        return this.client.post<Component>(
            `/api/projects/${this.project}/components/`,
            {
                name,
                slug: name,
                source_language: {code: 'en', name: 'English'},
                file_format: 'i18next',
                filemask: fileMask,
                vcs: 'github',
                repo,
                push: repoForUpdates,
                push_branch: repoForUpdates ? branch : undefined,
                branch,
                category: categoryId
                    ? `${this.serverUrl}/api/categories/${categoryId}/`
                    : undefined,
                template: source,
                new_base: source,
            },
        );
    }

    async findComponent({
        name,
        categorySlug,
    }: {
        name: string;
        categorySlug?: string;
    }) {
        const componentName = categorySlug ? `${categorySlug}%2F${name}` : name;

        try {
            return await this.client.get<Component>(
                `/api/components/${this.project}/${encodeURIComponent(
                    componentName,
                )}/`,
            );
        } catch (error) {
            if (isAxiosError(error) && error.response?.status === 404) {
                return undefined;
            }
            throw error;
        }
    }
}
