import {ActionMode, Configuration, getConfiguration} from './config';
import {Weblate} from './lib/weblate';
import {resolveComponents} from './utils';
import {setFailed} from '@actions/core';
import {context, getOctokit} from '@actions/github';
import {
    getComponentRepositoryErrors,
    getUntranslatedComponentsError,
    pullRemoteChanges,
    removeMissingComponents,
} from './lib/logic';

type HandlerArgs = {
    config: Configuration;
    weblate: Weblate;
};

type Handler = (args: HandlerArgs) => Promise<void>;

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
    const componentsInCode = await resolveComponents(
        config.keysetsPath,
        config.mainLanguage,
    );
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

    const mainComponent =
        (await weblate.getMainComponentInCategory({
            categoryId,
        })) ?? firstWeblateComponent;

    // Creating other components with a link to the first component
    const createComponentsPromises = otherComponents.map(component =>
        weblate.createComponent({
            name: component.name,
            fileMask: component.fileMask,
            categoryId,
            categorySlug,
            repo: `weblate://${config.project}/${categorySlug}/${mainComponent.slug}`,
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
                    pullRequestAuthor: config.pullRequestAuthor,
                    pullRequestNumber: config.pullRequestNumber,
                }),
            ),
        );

        // Wait repository update
        await weblate.waitComponentsTasks({
            componentNames: createdComponents.map(({name}) => name),
            categorySlug,
        });
    } else {
        const {mergeFailureMessage} = await pullRemoteChanges({
            weblate,
            config,
            categoryId,
            categorySlug,
        });

        if (mergeFailureMessage) {
            await octokit.rest.issues.createComment({
                ...context.repo,
                issue_number: config.pullRequestNumber as number,
                body: mergeFailureMessage,
            });

            setFailed(mergeFailureMessage);
            return;
        }
    }

    // Resolve components from file structure in feature branch
    const componentsInCode = await resolveComponents(
        config.keysetsPath,
        config.mainLanguage,
    );
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
        pullRequestAuthor: config.pullRequestAuthor,
        pullRequestNumber: config.pullRequestNumber,
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
            pullRequestAuthor: config.pullRequestAuthor,
            pullRequestNumber: config.pullRequestNumber,
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

    const repositoryErrors = await getComponentRepositoryErrors({
        name: firstWeblateComponent.name,
        categorySlug,
        config,
        weblate,
    });

    if (repositoryErrors.mergeFailureError) {
        await octokit.rest.issues.createComment({
            ...context.repo,
            issue_number: config.pullRequestNumber as number,
            body: repositoryErrors.mergeFailureError,
        });

        setFailed(repositoryErrors.mergeFailureError);
        return;
    }

    if (repositoryErrors.needsCommitError) {
        await octokit.rest.issues.createComment({
            ...context.repo,
            issue_number: config.pullRequestNumber as number,
            body: repositoryErrors.needsCommitError,
        });

        setFailed(repositoryErrors.needsCommitError);
        return;
    }

    if (repositoryErrors.needsPushError) {
        await octokit.rest.issues.createComment({
            ...context.repo,
            issue_number: config.pullRequestNumber as number,
            body: repositoryErrors.needsPushError,
        });

        setFailed(repositoryErrors.needsPushError);
        return;
    }

    const untranslatedComponentsError = await getUntranslatedComponentsError({
        components: weblateComponents,
        categorySlug,
        weblate,
    });

    if (untranslatedComponentsError) {
        await octokit.rest.issues.createComment({
            ...context.repo,
            issue_number: config.pullRequestNumber as number,
            body: untranslatedComponentsError,
        });

        setFailed(untranslatedComponentsError);
        return;
    }
};

const removeBranch = async ({config, weblate}: HandlerArgs) => {
    const category = await weblate.findCategoryForBranch(
        `${config.branchName}__${config.pullRequestNumber}`,
    );

    if (!category) {
        console.log(
            `Branch '${config.branchName}__${config.pullRequestNumber}' not found in Weblate.`,
        );
        return;
    }

    await weblate.removeCategory(category.id);
    console.log(
        `Branch '${config.branchName}__${config.pullRequestNumber}' removed from Weblate.`,
    );
};

const modeToHandler: Record<ActionMode, Handler> = {
    [ActionMode.SYNC_MASTER]: syncMaster,
    [ActionMode.VALIDATE_PULL_REQUEST]: validatePullRequest,
    [ActionMode.REMOVE_BRANCH]: removeBranch,
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
        mainLanguage: config.mainLanguage,
    });

    await modeToHandler[config.mode]({
        config,
        weblate,
    });
}

run();
