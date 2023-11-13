import {getConfiguration} from './config';
import path from 'path';
import {Weblate} from './lib/weblate';
import fs from 'fs/promises';

/*
    Какой флоу:
    1. Заводим новую категорию для ветки (если уже создана, то пропускаем). Имя категории = имени ветки.
    2.1. (пока делаю его) Создаем все компоненты в эой категории.
    2.2. (под вопросом) Создаем первый компонент в этой категории. Добавляем все остальные компоненты со ссылкой на первый компонент ( weblate://{project}/{componentNameFirst} ) https://docs.weblate.org/ru/weblate-5.1.1/vcs.html#internal-urls
    3. Ждем подтверждение всех ключей. Если по стате все ключи подтверждены, то ставим success.

    К имени компонентов добавляем постфикс с id pr
*/

const resolveComponents = async (keysetsPath: string) => {
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

async function run() {
    const config = getConfiguration();

    const configPretty = JSON.stringify(config, undefined, 2);
    console.log(`Parsed config: ${configPretty}`);

    const weblate = new Weblate({
        token: config.token,
        serverUrl: config.serverUrl,
        project: config.project,
    });

    const {id: categoryId, slug: categorySlug} =
        await weblate.createCategoryForBranch(config.branchName);

    const [firstComponent, ...otherComponents] = await resolveComponents(
        config.keysetsPath,
    );

    const firstComponentInWeblate = await weblate.createComponent({
        name: `${firstComponent.name}__${config.pullRequestNumber}`,
        fileMask: firstComponent.fileMask,
        categoryId,
        categorySlug,
        repo: config.gitRepo,
        branch: config.branchName,
        source: firstComponent.source,
        repoForUpdates: config.gitRepo,
    });

    const promises = otherComponents.map(component =>
        weblate.createComponent({
            name: `${component.name}__${config.pullRequestNumber}`,
            fileMask: component.fileMask,
            categoryId,
            categorySlug,
            repo: `weblate://${config.project}/${categorySlug}/${firstComponentInWeblate.slug}`,
            source: component.source,
        }),
    );

    await Promise.all(promises);
}

run();
