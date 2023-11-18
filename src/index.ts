import {getConfiguration} from './config';
import path from 'path';
import {Weblate} from './lib/weblate';
import fs from 'fs/promises';
import {setFailed} from '@actions/core';

/*
    Какой флоу:
    1. Заводим новую категорию для ветки (если уже создана, то пропускаем). Имя категории = имени ветки.
    2.1. (пока делаю его) Создаем все компоненты в эой категории.
    2.2. (под вопросом) Создаем первый компонент в этой категории. Добавляем все остальные компоненты со ссылкой на первый компонент ( weblate://{project}/{componentNameFirst} ) https://docs.weblate.org/ru/weblate-5.1.1/vcs.html#internal-urls
    3. Ждем подтверждение всех ключей. Если по стате все ключи подтверждены, то ставим success.

    К имени компонентов добавляем постфикс с id pr
*/

const sleep = (time: number) =>
    new Promise(resolve => setTimeout(resolve, time));

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

    const weblate = new Weblate({
        token: config.token,
        serverUrl: config.serverUrl,
        project: config.project,
    });

    // Create branch
    const {
        id: categoryId,
        slug: categorySlug,
        wasRecentlyCreated: categoryWasRecentlyCreated,
    } = await weblate.createCategoryForBranch(config.branchName);

    const [firstComponent, ...otherComponents] = await resolveComponents(
        config.keysetsPath,
    );

    // Creating first component
    const firstWeblateComponent = await weblate.createComponent({
        name: `${firstComponent.name}__${config.pullRequestNumber}`,
        fileMask: firstComponent.fileMask,
        categoryId,
        categorySlug,
        repo: config.gitRepo,
        branch: config.branchName,
        source: firstComponent.source,
        repoForUpdates: config.gitRepo,
    });

    // Creating other components with a link to the first component
    const createComponentsPromises = otherComponents.map(component =>
        weblate.createComponent({
            name: `${component.name}__${config.pullRequestNumber}`,
            fileMask: component.fileMask,
            categoryId,
            categorySlug,
            repo: `weblate://${config.project}/${categorySlug}/${firstWeblateComponent.slug}`,
            source: component.source,
        }),
    );

    const otherWeblateComponents = await Promise.all(createComponentsPromises);

    const weblateComponents = [
        firstWeblateComponent,
        ...otherWeblateComponents,
    ];

    // Pulling changes to weblate from remote repository
    if (!categoryWasRecentlyCreated) {
        await weblate.pullComponentRemoteChanges({
            name: firstWeblateComponent.name,
            categorySlug,
        });
    }

    // Wait repository update
    // TODO replace sleep to checking components statuses
    await sleep(20000);

    await weblate.getComponentTranslationsStats({
        name: firstWeblateComponent.name,
    });

    const componentsStats = await Promise.all(
        weblateComponents.map(component =>
            weblate.getComponentTranslationsStats({
                name: component.name,
                categorySlug,
            }),
        ),
    );

    const failedComponents = componentsStats
        .flat()
        .filter(stats => stats.translated_percent !== 100);

    if (failedComponents.length) {
        const failedComponentsLinks = failedComponents
            .map(stat => stat.url)
            .join('\n');

        setFailed(
            `The following components have not been translated:\n${failedComponentsLinks}`,
        );
    }
}

run();
