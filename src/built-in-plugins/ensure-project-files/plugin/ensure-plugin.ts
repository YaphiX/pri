import * as fs from 'fs-extra';
import * as _ from 'lodash';
import * as path from 'path';
import * as prettier from 'prettier';
import * as pkg from '../../../../package.json';
import { componentEntry, pri } from '../../../node';
import { PRI_PACKAGE_NAME } from '../../../utils/constants';
import { globalState } from '../../../utils/global-state';
import { logSuccess, logText } from '../../../utils/log';
import { prettierConfig } from '../../../utils/prettier-config';

export function ensurePluginFiles() {
  ensurePackageJson();
  ensureEntry();
  ensureTest();
}

function ensureEntry() {
  pri.project.addProjectFiles({
    fileName: path.format(componentEntry),
    pipeContent: text =>
      text
        ? text
        : prettier.format(
            `
            import * as path from "path"
            import { pri } from "${PRI_PACKAGE_NAME}"

            interface IResult {
              customPlugin: {
                hasComponents: boolean
              }
            }

            export default async () => {
              pri.commands.registerCommand({
                name: ["deploy"],
                action: async () => {
                  //
                }
              })

              pri.commands.expandCommand({
                name: ["init"],
                beforeAction: async (...args: any[]) => {
                  //
                }
              })

              pri.project.onAnalyseProject(files => {
                return { customPlugin: { hasComponents: judgeHasComponents(pri.projectRootPath, files) } } as IResult
              })

              pri.project.onCreateEntry((analyseInfo: IResult, entry) => {
                if (!analyseInfo.customPlugin.hasComponents) {
                  return
                }

                entry.pipeAppHeader(header => {
                  return \`
                    \${header}
                    import "src/components/xxx"
                  \`
                })
              })
            }

            export function judgeHasComponents(projectRootPath: string, files: path.ParsedPath[]) {
              return files.some(file => {
                const relativePath = path.relative(projectRootPath, path.join(file.dir, file.name))
                if (relativePath.startsWith("src/components")) {
                  return true
                }
                return false
              })
            }
          `,
            { ...prettierConfig, parser: 'typescript' }
          )
  });
}

function ensureTest() {
  const fileName = 'tests/index.ts';
  const filePath = path.join(globalState.projectRootPath, fileName);

  if (fs.existsSync(filePath)) {
    logSuccess(`Test file already exist.`);
    return;
  }

  pri.project.addProjectFiles({
    fileName,
    pipeContent: prev =>
      prettier.format(
        `
          import * as path from "path"
          import { judgeHasComponents } from "../src"

          const testProjectRootPath = "/Users/someOne/workspace"

          const testFilePaths = (filePaths: string[]) =>
            filePaths.map(filePath => path.join(testProjectRootPath, filePath)).map(filePath => path.parse(filePath))

          test("Single file", () => {
            const relativeProjectFiles = ["src/components"]
            expect(judgeHasComponents(testProjectRootPath, testFilePaths(relativeProjectFiles))).toBe(true)
          })

          test("Multiple files", () => {
            const relativeProjectFiles = [
              "src/components/index.tsx",
              "src/components/button/index.tsx",
              "src/components/select/index.tsx"
            ]
            expect(judgeHasComponents(testProjectRootPath, testFilePaths(relativeProjectFiles))).toBe(true)
          })

          test("hasn't components", () => {
            const relativeProjectFiles = ["src/pages/index.tsx"]
            expect(judgeHasComponents(testProjectRootPath, testFilePaths(relativeProjectFiles))).toBe(false)
          })
        `,
        { ...prettierConfig, parser: 'typescript' }
      )
  });
}

export function ensurePackageJson() {
  pri.project.addProjectFiles({
    fileName: 'package.json',
    pipeContent: prev => {
      const prevJson = prev ? JSON.parse(prev) : {};
      const projectPriVersion =
        _.get(prevJson, 'devDependencies.pri') || _.get(prevJson, 'dependencies.pri') || pkg.version;

      _.unset(prevJson, 'dependencies.pri');
      _.set(prevJson, `devDependencies.${PRI_PACKAGE_NAME}`, projectPriVersion);

      return (
        JSON.stringify(
          _.merge({}, prevJson, {
            main: `${pri.projectConfig.distDir}/index.js`,
            scripts: { prepublishOnly: 'npm run build' },
            types: path.format(componentEntry),
            dependencies: {
              '@babel/runtime': '^7.0.0'
            }
          }),
          null,
          2
        ) + '\n'
      );
    }
  });
}