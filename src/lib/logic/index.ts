import type {Configuration} from '../../config';
import type {Weblate} from '../weblate';
import type {ComponentInCode} from '../../utils';
import partition from 'lodash/partition';
import type {Component} from '../weblate/types';

type RemoveMissingComponentsInput = {
    config: Configuration;
    weblate: Weblate;
    categoryId: string;
    categorySlug: string;
    componentsInCode: ComponentInCode[];
};

export const removeMissingComponents = async ({
    config,
    weblate,
    categoryId,
    categorySlug,
    componentsInCode,
}: RemoveMissingComponentsInput) => {
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

type GetComponentRepositoryErrorsInput = {
    name: string;
    categorySlug?: string;
    weblate: Weblate;
    config: Configuration;
};

type GetComponentRepositoryErrorsOutput = {
    needsPushError?: string;
    needsCommitError?: string;
    mergeFailureError?: string;
};

export const getComponentRepositoryErrors = async ({
    name,
    categorySlug,
    config,
    weblate,
}: GetComponentRepositoryErrorsInput) => {
    const errors: GetComponentRepositoryErrorsOutput = {
        needsPushError: undefined,
        needsCommitError: undefined,
        mergeFailureError: undefined,
    };

    const mainComponent = await weblate.findComponent({name, categorySlug});

    if (!mainComponent) {
        throw Error(
            `Not found component ${name} (categorySlug: ${categorySlug})`,
        );
    }

    const repositoryInfo = await weblate.getComponentRepository({
        name,
        categorySlug,
    });

    if (repositoryInfo.needs_push) {
        errors.needsPushError = [
            '**i18n-check**',
            'Please merge the Pull Request with the changes from Weblate into your branch.',
        ].join('\n');
    }

    if (repositoryInfo.needs_commit) {
        errors.needsCommitError = [
            '**i18n-check**',
            'The reviewer is still working on checking your i18n changes. Wait for a Pull Request from Weblate.',
        ].join('\n');
    }

    if (repositoryInfo.merge_failure) {
        errors.mergeFailureError = [
            '**i18n-check**',
            '<details>',
            '<summary>Errors occurred when merging changes from your branch with the Weblate branch.</summary>',
            '',
            '```',
            repositoryInfo.merge_failure.replaceAll('```', ''),
            '```',
            '',
            '</details>',
            '',
            '**Resolve conflicts according to instructions**',
            '1. Switch to the current branch associated with this pull request.',
            '```',
            `git checkout ${config.branchName}`,
            '```',
            '2. Add Weblate as remote:',
            '```',
            `git remote add weblate ${mainComponent.git_export}`,
            'git remote update weblate',
            '```',
            '3. Merge Weblate changes:',
            '```',
            `git merge weblate/${config.branchName}`,
            '```',
            '4. Resolve conflicts:',
            '```',
            'edit ...',
            'git add ...',
            'git commit',
            '```',
            '5. Push changes to upstream repository, Weblate will fetch merge from there:',
            '```',
            'git push origin',
            '```',
        ].join('\n');
    }

    return errors;
};

type PullRemoteChangesInput = {
    weblate: Weblate;
    config: Configuration;
    categoryId: string;
    categorySlug: string;
};

type PullRemoteChangesOutput = {
    mainComponent?: Component;
    mergeFailureMessage?: string;
};

export const pullRemoteChanges = async ({
    weblate,
    config,
    categoryId,
    categorySlug,
}: PullRemoteChangesInput): Promise<PullRemoteChangesOutput> => {
    const weblateComponents = await weblate.getComponentsInCategory({
        categoryId,
    });

    if (!weblateComponents.length) {
        return {mergeFailureMessage: undefined};
    }

    const mainComponent = weblateComponents.find(
        ({repo}) => !repo.startsWith('weblate://'),
    );

    if (!mainComponent) {
        return {mainComponent, mergeFailureMessage: undefined};
    }

    await weblate.pullComponentRemoteChanges({
        name: mainComponent.name,
        categorySlug,
    });

    await weblate.waitComponentsTasks({
        componentNames: weblateComponents.map(({name}) => name),
        categorySlug,
    });

    const repositoryErrors = await getComponentRepositoryErrors({
        name: mainComponent.name,
        categorySlug,
        weblate,
        config,
    });

    return {
        mainComponent,
        mergeFailureMessage: repositoryErrors.mergeFailureError,
    };
};

type GetUntranslatedComponentsInput = {
    components: Component[];
    weblate: Weblate;
    categorySlug: string;
};

export const getUntranslatedComponentsError = async ({
    components,
    weblate,
    categorySlug,
}: GetUntranslatedComponentsInput) => {
    const componentsStats = await Promise.all(
        components.map(component =>
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
                const name = stat.componentName.split('__')[0];
                return `<a href="${stat.url}">${name} (${stat.code})</a>`;
            })
            .join('<br>');

        return [
            '**i18n-check**',
            '<details>',
            '<summary>The following components have not been translated</summary>',
            `<p>${failedComponentsLinks}</p>`,
            '</details>',
            '\nWait for the reviewers to check your changes in Weblate and try running github action again.',
        ].join('\n');
    }

    return undefined;
};
