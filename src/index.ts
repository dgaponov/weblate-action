import {info} from '@actions/core';
import {getConfiguration} from './config';
import {context} from '@actions/github';
import {Weblate} from './lib/weblate';

/*
    Какой флоу:
    1. Заводим новую категорию для ветки (если уже создана, то пропускаем). Имя категории = имени ветки.
    2.1. (пока делаю его) Создаем все компоненты в эой категории.
    2.2. (под вопросом) Создаем первый компонент в этой категории. Добавляем все остальные компоненты со ссылкой на первый компонент ( weblate://{project}/{componentNameFirst} ) https://docs.weblate.org/ru/weblate-5.1.1/vcs.html#internal-urls
    3. Ждем подтверждение всех ключей. Если по стате все ключи подтверждены, то ставим success.

    К имени компонентов добавляем постфикс с id pr
*/

async function run() {
    info('Start parse config');
    const config = getConfiguration();

    const configPretty = JSON.stringify(config, undefined, 2);
    console.log(`Parsed config: ${configPretty}`);

    // Get the JSON webhook payload for the event that triggered the workflow
    const payload = JSON.stringify(context.payload, undefined, 2);
    console.log(`The event payload: ${payload}`);

    const weblate = new Weblate({
        token: config.token,
        serverUrl: config.serverUrl,
        project: config.project,
        gitRepo: config.gitRepo,
    });

    const category = await weblate.createCategoryForBranch(config.branchName);
    const categoryPretty = JSON.stringify(category, undefined, 2);
    console.log(`Created category: ${categoryPretty}`);
}

run();
