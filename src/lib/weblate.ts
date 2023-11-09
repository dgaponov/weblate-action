import axios from 'axios';
import type {AxiosInstance} from 'axios';
import type {Category, Paginated} from './types';
import {getSlugForBranch, normalizeResponse} from './normalizers';

declare module 'axios' {
    interface AxiosResponse<T = any> extends Promise<T> {}
}

interface WeblateConstructorArg {
    serverUrl: string;
    token: string;
    project: string;
    gitRepo: string;
}

export class Weblate {
    private project: string;
    private gitRepo: string;
    private client: AxiosInstance;

    constructor({serverUrl, token, project, gitRepo}: WeblateConstructorArg) {
        this.project = project;
        this.gitRepo = gitRepo;

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
            project: this.project,
            name: branchName,
            slug: getSlugForBranch(branchName),
        });
    }

    async findCategoryForBranch(branchName: string) {
        let category: Category | undefined;
        let page: number | undefined;

        while (!category && page) {
            const {next, results} = await this.client.get<Paginated<Category>>(
                `/api/projects/${this.project}/categories/`,
                {
                    params: {page},
                },
            );

            category = results.find(({name}) => name === branchName);
            page = next;
        }

        return category;
    }

    createComponent({
        name,
        branch,
        fileMask,
        category,
    }: {
        name: string;
        branch?: string;
        fileMask: string;
        category?: string;
    }) {
        return this.client.post(`/api/projects/${this.project}/components/`, {
            name,
            slug: name,
            project: this.project,
            source_language: {code: 'en', name: 'English'},
            file_format: 'i18next',
            filemask: fileMask,
            vcs: 'git',
            repo: this.gitRepo,
            push: this.gitRepo,
            branch,
            category,
        });
    }

    async findComponent({name}: {name: string; branch?: string}) {
        return this.client.post(`/api/projects/${this.project}/components/`, {
            name,
            slug: name,
            project: this.project,
            source_language: {code: 'en', name: 'English'},
            file_format: 'i18next',
            filemask: fileMask,
            vcs: 'git',
            repo: this.gitRepo,
            push: this.gitRepo,
            branch,
            category,
        });
    }
}
