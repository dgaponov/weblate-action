import type {AxiosResponse} from 'axios';
import kebabCase from 'lodash/kebabCase';

type Json =
    | string
    | number
    | boolean
    | null
    | undefined
    | Json[]
    | {[key: string]: Json};

const getUrlLastPart = (url: string) => {
    const parts = url.split('/').filter(Boolean);
    const lastPart = parts.pop();

    if (!lastPart) {
        throw Error(url);
    }

    return lastPart;
};

const normalizeData = (value: Json): Json => {
    if (Array.isArray(value)) {
        return value.map(normalizeData);
    }

    if (value === null) {
        return undefined;
    }

    if (typeof value === 'string') {
        // Extract id from weblate api url
        return value.startsWith('http') && value.includes('/api/')
            ? getUrlLastPart(value)
            : value;
    }

    if (typeof value === 'object') {
        const normalizedObject = value;

        for (const objectKey of Object.keys(value)) {
            const valueToNormalize = value[objectKey];

            if (
                typeof valueToNormalize === 'string' &&
                objectKey === 'url' &&
                !('id' in normalizedObject)
            ) {
                normalizedObject.id = getUrlLastPart(valueToNormalize);
            } else {
                normalizedObject[objectKey] = normalizeData(value[objectKey]);
            }
        }

        return normalizedObject;
    }

    return value;
};

export const normalizeResponse = (response: AxiosResponse): AxiosResponse => {
    const normalizedResponse = normalizeData(response.data as Json);

    if (
        normalizedResponse &&
        typeof normalizedResponse === 'object' &&
        !Array.isArray(normalizeResponse)
    ) {
        if (
            'next' in normalizedResponse &&
            typeof normalizedResponse['next'] === 'string'
        ) {
            normalizedResponse['next'] = parseInt(
                normalizedResponse['next'],
                10,
            );
        }

        if (
            'previous' in normalizedResponse &&
            typeof normalizedResponse['previous'] === 'string'
        ) {
            normalizedResponse['previous'] = parseInt(
                normalizedResponse['previous'],
                10,
            );
        }
    }

    return normalizedResponse as unknown as AxiosResponse;
};

export const getSlugForBranch = (branchName: string) => kebabCase(branchName);
