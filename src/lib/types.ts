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
};

export type Component = {
    id: string;
    project: string;
    name: string;
    slug: string;
};