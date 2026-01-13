export type Paginated<T> = Readonly<{
    count: number;
    next?: number;
    previous?: number;
    results: T[];
}>;

export type Category = {
    id: string;
    project: string;
    name: string;
    slug: string;
    wasRecentlyCreated?: boolean;
};

export type Component = {
    id: string;
    project: string;
    name: string;
    slug: string;
    addons: string[];
    filemask: string;
    repo: string;
    template: string;
    category?: string;
    task_url?: string;
    git_export?: string;
    wasRecentlyCreated?: boolean;
    linked_component: string | null;
};

export type ComponentTranslationStats = {
    total: number;
    total_words: number;
    total_chars: number;
    translated: number;
    translated_words: number;
    translated_percent: number;
    translated_words_percent: number;
    translated_chars: number;
    translated_chars_percent: number;
    fuzzy: number;
    fuzzy_percent: number;
    failing: number;
    failing_percent: number;
    approved: number;
    approved_percent: number;
    code: string;
    name: string;
    url: string;
};

export type ComponentRepository = {
    needs_commit: boolean;
    needs_merge: boolean;
    needs_push: boolean;
    merge_failure?: string;
};
