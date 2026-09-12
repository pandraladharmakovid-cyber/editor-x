export interface FileNode {
  file?: {
    contents: string;
  };
  directory?: {
    [key: string]: FileNode;
  };
}

export interface FileSystemTree {
  [key: string]: FileNode;
}

export const defaultTemplate: FileSystemTree = {
  'package.json': {
    file: {
      contents: JSON.stringify(
        {
          name: 'editor-x-project',
          private: true,
          version: '0.0.0',
          type: 'module',
          scripts: {
            dev: 'vite',
            build: 'tsc && vite build',
            preview: 'vite preview',
          },
          dependencies: {
            react: '^18.2.0',
            'react-dom': '^18.2.0',
          },
          devDependencies: {
            '@types/react': '^18.2.43',
            '@types/react-dom': '^18.2.17',
            '@vitejs/plugin-react': '^4.2.1',
            typescript: '^5.2.2',
            vite: '^5.0.0',
          },
        },
        null,
        2,
      ),
    },
  },

  '.npmrc': {
    file: {
      contents: `# EDITOR X project configuration
shamefully-hoist=true
strict-peer-dependencies=false
`,
    },
  },

  'index.html': {
    file: {
      contents: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      name="description"
      content="Project created with EDITOR X"
    />
    <title>EDITOR X Project</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    },
  },

  'vite.config.ts': {
    file: {
      contents: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`,
    },
  },

  'tsconfig.json': {
    file: {
      contents: JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2020',
            useDefineForClassFields: true,
            lib: ['ES2020', 'DOM', 'DOM.Iterable'],
            allowJs: false,
            skipLibCheck: true,
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            strict: true,
            forceConsistentCasingInFileNames: true,
            module: 'ESNext',
            moduleResolution: 'Node',
            resolveJsonModule: true,
            isolatedModules: true,
            noEmit: true,
            jsx: 'react-jsx',
          },
          include: ['src'],
        },
        null,
        2,
      ),
    },
  },

  src: {
    directory: {
      'main.tsx': {
        file: {
          contents: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
        },
      },

      'App.tsx': {
        file: {
          contents: `function App() {
  return (
    <main className="app">
      <div className="card">
        <p className="eyebrow">EDITOR X</p>

        <h1>Your project is ready.</h1>

        <p className="description">
          Start building directly in your browser.
        </p>
      </div>
    </main>
  );
}

export default App;
`,
        },
      },

      'index.css': {
        file: {
          contents: `:root {
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;

  color: #e5e7eb;
  background: #030712;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  width: 100%;
  min-width: 320px;
  min-height: 100vh;
  margin: 0;
}

body {
  min-height: 100vh;
  background: #030712;
}

button,
input,
textarea,
select {
  font: inherit;
}

.app {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.card {
  width: min(720px, 100%);
  padding: 40px;
  border: 1px solid #1f2937;
  border-radius: 16px;
  background: #111827;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
}

.eyebrow {
  margin: 0 0 12px;
  color: #60a5fa;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

h1 {
  margin: 0;
  color: #f9fafb;
  font-size: clamp(28px, 5vw, 48px);
  line-height: 1.1;
}

.description {
  margin: 16px 0 0;
  color: #9ca3af;
  font-size: 16px;
  line-height: 1.6;
}
`,
        },
      },
    },
  },
};