import {ActionMode, Configuration, getConfiguration} from './config';
import {Weblate} from './lib/weblate';
import {ComponentInCode, resolveComponents} from './utils';
import {setFailed} from '@actions/core';
import partition from 'lodash/partition';
import {context, getOctokit} from '@actions/github';

type HandlerArgs = {
    config: Configuration;
    weblate: Weblate;
};

type Handler = (args: HandlerArgs) => Promise<void>;

const removeMissingComponents = async ({
    config,
    weblate,
    categoryId,
    categorySlug,
    componentsInCode,
}: {
    config: Configuration;
    weblate: Weblate;
    categoryId: string;
    categorySlug: string;
    componentsInCode: ComponentInCode[];
}) => {
    const weblateComponents = await weblate.getComponentsInCategory({
        categoryId,
    });

    // Removing components that don't exist in the code
    const [componentsToRemove, aliveComponents] = partition(
        weblateComponents,
        ({name}) =>
            !componentsInCode.find(
                component => component.name === name.split('__')[0],
            ),
    );

    if (componentsToRemove.length) {
        const componentsWithoutLinking = componentsToRemove.filter(
            ({repo}) => !repo.startsWith('weblate://'),
        );

        // Set component as the main and linking with others
        if (componentsWithoutLinking.length && aliveComponents.length) {
            const [mainComponent, ...componentsToLinking] = aliveComponents;

            await weblate.updateComponent({
                name: mainComponent.name,
                categorySlug,
                repo: config.gitRepo,
                branch: config.branchName,
                fileMask: mainComponent.filemask,
                repoForUpdates: config.gitRepo,
                branchForUpdates: config.branchName,
            });

            const requests = componentsToLinking.map(component =>
                weblate.updateComponent({
                    name: component.name,
                    categorySlug,
                    repo: `weblate://${config.project}/${categorySlug}/${mainComponent.slug}`,
                    fileMask: component.filemask,
                }),
            );

            await Promise.all(requests);
        }

        // Remove components
        const requests = componentsToRemove.map(({name}) =>
            weblate.removeComponent({name, categorySlug}),
        );

        await Promise.all(requests);
    }
};

const syncMaster = async ({config, weblate}: HandlerArgs) => {
    // Create category for master branch
    const {
        id: categoryId,
        slug: categorySlug,
        wasRecentlyCreated: categoryWasRecentlyCreated,
    } = await weblate.createCategoryForBranch(config.branchName);

    if (!categoryWasRecentlyCreated) {
        const weblateComponents = await weblate.getComponentsInCategory({
            categoryId,
        });
        const mainComponent = weblateComponents.find(
            ({repo}) => !repo.startsWith('weblate://'),
        );
        if (mainComponent) {
            await weblate.pullComponentRemoteChanges({
                name: mainComponent.name,
                categorySlug,
            });
            await weblate.waitComponentsTasks({
                componentNames: weblateComponents.map(({name}) => name),
                categorySlug,
            });
        }
    }

    // Resolve components from file structure in master branch
    const componentsInCode = await resolveComponents(config.keysetsPath);
    const [firstComponent, ...otherComponents] = componentsInCode;

    // Creating first component for master branch
    const firstWeblateComponent = await weblate.createComponent({
        name: firstComponent.name,
        fileMask: firstComponent.fileMask,
        categoryId,
        categorySlug,
        repo: config.gitRepo,
        branch: config.branchName,
        source: firstComponent.source,
        repoForUpdates: config.gitRepo,
        applyDefaultAddons: false,
    });

    // Creating other components with a link to the first component
    const createComponentsPromises = otherComponents.map(component =>
        weblate.createComponent({
            name: component.name,
            fileMask: component.fileMask,
            categoryId,
            categorySlug,
            repo: `weblate://${config.project}/${categorySlug}/${firstWeblateComponent.slug}`,
            source: component.source,
            applyDefaultAddons: false,
        }),
    );

    const otherWeblateComponents = await Promise.all(createComponentsPromises);

    // Pulling changes to weblate from remote repository
    if (!categoryWasRecentlyCreated) {
        await weblate.pullComponentRemoteChanges({
            name: firstWeblateComponent.name,
            categorySlug,
        });
    }

    const weblateComponents = [
        firstWeblateComponent,
        ...otherWeblateComponents,
    ];

    await weblate.waitComponentsTasks({
        componentNames: weblateComponents.map(({name}) => name),
        categorySlug,
    });

    await removeMissingComponents({
        config,
        weblate,
        categoryId,
        categorySlug,
        componentsInCode,
    });
};

const validatePullRequest = async ({config, weblate}: HandlerArgs) => {
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

        const createdComponents = await Promise.all(
            masterComponents.map(component =>
                weblate.createComponent({
                    name: `${component.name}__${config.pullRequestNumber}`,
                    fileMask: component.filemask,
                    categoryId,
                    categorySlug,
                    repo: `weblate://${config.project}/${masterCategory.slug}/${firstMasterComponent.slug}`,
                    source: component.template,
                    applyDefaultAddons: false,
                }),
            ),
        );

        // Wait repository update
        await weblate.waitComponentsTasks({
            componentNames: createdComponents.map(({name}) => name),
            categorySlug,
        });
    }

    // Resolve components from file structure in feature branch
    const componentsInCode = await resolveComponents(config.keysetsPath);
    const [firstComponent, ...otherComponents] = componentsInCode;

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
    await weblate.waitComponentsTasks({
        componentNames: weblateComponents.map(({name}) => name),
        categorySlug,
    });

    await removeMissingComponents({
        config,
        weblate,
        categoryId,
        categorySlug,
        componentsInCode,
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
            .map(stat => {
                const name = stat.name.split('__')[0];
                return `<a href="${stat.url}">${name} (${stat.code})</a>`;
            })
            .join('<br>');

        const errorMessage = [
            '**i18n-check**',
            '<details>',
            '<summary>The following components have not been translated</summary>',
            `<p>${failedComponentsLinks}</p>`,
            '</details>',
            '\nWait for the reviewers to check your changes in Weblate and try running github action again.',
        ].join('\n');

        await octokit.rest.issues.createComment({
            ...context.repo,
            issue_number: config.pullRequestNumber as number,
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
            issue_number: config.pullRequestNumber as number,
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
            issue_number: config.pullRequestNumber as number,
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
            issue_number: config.pullRequestNumber as number,
            body: errorMessage,
        });

        setFailed(errorMessage);
        return;
    }
};

const modeToHandler: Record<ActionMode, Handler> = {
    [ActionMode.SYNC_MASTER]: syncMaster,
    [ActionMode.VALIDATE_PULL_REQUEST]: validatePullRequest,
};

async function run() {
    const config = getConfiguration();

    console.log('Config:');
    console.log(JSON.stringify(config, null, 4));

    const weblate = new Weblate({
        token: config.token,
        serverUrl: config.serverUrl,
        project: config.project,
        fileFormat: config.fileFormat,
    });

    await modeToHandler[config.mode]({
        config,
        weblate,
    });
}

run();
