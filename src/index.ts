import {debug} from '@actions/core';
import {getConfiguration} from './config';
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
    const config = getConfiguration();
    debug(JSON.stringify(config));

    const weblate = new Weblate({
        token: config.token,
        serverUrl: config.serverUrl,
        project: config.project,
        gitRepo: '',
    });

    await weblate.createCategoryForBranch(config.branchName);
}

run();
