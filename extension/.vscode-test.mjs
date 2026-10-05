import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/extension.test.js',
	useInstallation: process.env.VSCODE_EXECUTABLE_PATH
		? { fromPath: process.env.VSCODE_EXECUTABLE_PATH } : undefined,
	mocha: { timeout: 15000 },
});
