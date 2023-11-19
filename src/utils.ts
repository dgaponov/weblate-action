import fs from 'fs/promises';
import path from 'path';

export const sleep = (time: number) =>
    new Promise(resolve => setTimeout(resolve, time));

export const resolveComponents = async (keysetsPath: string) => {
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
