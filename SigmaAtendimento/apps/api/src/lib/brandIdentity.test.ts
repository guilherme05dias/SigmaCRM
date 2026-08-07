import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const TEXT_EXTENSIONS = new Set(['.md', '.sql', '.ts', '.tsx']);
const IGNORED_DIRECTORIES = new Set(['.git', 'coverage', 'dist', 'node_modules']);

function collectTextFiles(root: string): string[] {
    if (!existsSync(root)) return [];

    return readdirSync(root).flatMap((entry) => {
        const path = resolve(root, entry);
        const stats = statSync(path);
        if (stats.isDirectory()) {
            return IGNORED_DIRECTORIES.has(entry) ? [] : collectTextFiles(path);
        }

        const extension = entry.slice(entry.lastIndexOf('.'));
        return TEXT_EXTENSIONS.has(extension) ? [path] : [];
    });
}

describe('identidade da operação', () => {
    it('@spec:AC-012 mantém código, dados e textos exclusivamente com a identidade SigmaPDV', () => {
        const forbiddenBrand = new RegExp(['dragon', 'byte'].join(''), 'i');
        const roots = [
            resolve('apps/api/src'),
            resolve('apps/api/prisma/migrations'),
            resolve('apps/web/src'),
            resolve('supabase/migrations'),
            resolve('../docs'),
            resolve('../.spec/features/acesso-global-carlos'),
        ];
        const violations = roots
            .flatMap(collectTextFiles)
            .filter((path) => forbiddenBrand.test(readFileSync(path, 'utf8')));

        expect(violations).toEqual([]);
    });
});
