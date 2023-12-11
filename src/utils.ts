import fs from 'fs/promises';
import path from 'path';

export const sleep = (time: number) =>
    new Promise(resolve => setTimeout(resolve, time));

export type ComponentInCode = {
    name: string;
    source: string;
    fileMask: string;
};

export const resolveComponents = async (
    keysetsPath: string,
): Promise<ComponentInCode[]> => {
    const dirents = await fs.readdir(path.resolve(process.cwd(), keysetsPath), {
        withFileTypes: true,
    });

    return dirents
        .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.'))
        .map(({name}) => ({
            name,
            source: path.join(keysetsPath, name, 'en.json'),
            fileMask: path.join(keysetsPath, name, '*.json'),
        }));
};
