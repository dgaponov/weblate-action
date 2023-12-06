import {getConfiguration} from './config';
import {Weblate} from './lib/weblate';
import {resolveComponents, sleep} from './utils';
import {setFailed} from '@actions/core';
import {context, getOctokit} from '@actions/github';

async function run() {
    const config = getConfiguration();

    const weblate = new Weblate({
        token: config.token,
        serverUrl: config.serverUrl,
        project: config.project,
        fileFormat: config.fileFormat,
    });

    const octokit = getOctokit(config.githubToken);

    // Create category for feature branch
    const {
        id: categoryId,
        slug: categorySlug,
        wasRecentlyCreated: categoryWasRecentlyCreated,
    } = await weblate.createCategoryForBranch(
        `${config.branchName}__${config.pullRequestNumber}`,
    );

    // If the category was recently created, then we need to copy components from master branch
    if (categoryWasRecentlyCreated) {
        const masterCategory = await weblate.findCategoryForBranch(
            config.masterBranch,
        );

        if (!masterCategory) {
            setFailed(`Not found category for branch '${config.masterBranch}'`);
            return;
        }

        const masterComponents = await weblate.getComponentsInCategory({
            categoryId: masterCategory.id,
        });

        const firstMasterComponent = masterComponents[0];

        await Promise.all(
            masterComponents.map(component =>
                weblate.createComponent({
                    name: `${component.name}__${config.pullRequestNumber}`,
                    fileMask: component.filemask,
                    categoryId,
                    categorySlug,
                    repo: `weblate://${config.project}/${masterCategory.slug}/${firstMasterComponent.slug}`,
                    branch: config.masterBranch,
                    source: component.template,
                    repoForUpdates: config.gitRepo,
                    branchForUpdates: config.branchName,
                    applyDefaultAddons: false,
                }),
            ),
        );

        // Wait repository update
        // TODO replace sleep to checking components statuses
        await sleep(60000);
    }

    // Resolve components from file structure in feature branch
    const [firstComponent, ...otherComponents] = await resolveComponents(
        config.keysetsPath,
    );

    // Creating first component for feature branch
    const firstWeblateComponent = await weblate.createComponent({
        name: `${firstComponent.name}__${config.pullRequestNumber}`,
        fileMask: firstComponent.fileMask,
        categoryId,
        categorySlug,
        repo: config.gitRepo,
        branch: config.branchName,
        source: firstComponent.source,
        repoForUpdates: config.gitRepo,
        updateIfExist: categoryWasRecentlyCreated,
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
            updateIfExist: categoryWasRecentlyCreated,
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
    await sleep(60000);

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

        const errorMessage = [
            '**i18n-check**',
            'The following components have not been translated:',
            `${failedComponentsLinks}\n`,
            'Wait for the reviewers to check your changes in Weblate and try running github action again.',
        ].join('\n');

        await octokit.rest.issues.createComment({
            ...context.repo,
            issue_number: config.pullRequestNumber,
            body: errorMessage,
        });

        setFailed(errorMessage);
        return;
    }

    const repositoryInfo = await weblate.getComponentRepository({
        name: firstWeblateComponent.name,
        categorySlug,
    });

    if (repositoryInfo.needs_push) {
        const errorMessage = [
            '**i18n-check**',
            'Please merge the Pull Request with the changes from Weblate into your branch.',
        ].join('\n');

        await octokit.rest.issues.createComment({
            ...context.repo,
            issue_number: config.pullRequestNumber,
            body: errorMessage,
        });

        setFailed(errorMessage);
    }

    if (repositoryInfo.needs_commit) {
        const errorMessage = [
            '**i18n-check**',
            'The reviewer is still working on checking your i18n changes. Wait for a Pull Request from Weblate.',
        ].join('\n');

        await octokit.rest.issues.createComment({
            ...context.repo,
            issue_number: config.pullRequestNumber,
            body: errorMessage,
        });

        setFailed(errorMessage);
        return;
    }

    if (repositoryInfo.merge_failure) {
        const errorMessage = [
            '**i18n-check**',
            'Errors occurred when merging changes from your branch with the Weblate branch.',
            `\`\`\`${repositoryInfo.merge_failure}\`\`\`\n`,
            'Resolve conflicts according to instructions',
            'https://docs.weblate.org/en/latest/faq.html#how-to-fix-merge-conflicts-in-translations',
        ].join('\n');

        await octokit.rest.issues.createComment({
            ...context.repo,
            issue_number: config.pullRequestNumber,
            body: errorMessage,
        });

        setFailed(errorMessage);
        return;
    }
}

run();
