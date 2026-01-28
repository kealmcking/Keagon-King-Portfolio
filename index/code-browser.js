/**
 * GitHub Code Browser Component
 * Fetches repository contents from GitHub API and displays them in a file tree
 */
class GitHubCodeBrowser {
    constructor(containerId, repoUrl, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`Container with id "${containerId}" not found`);
            return;
        }

        // Parse repository URL
        const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) {
            console.error('Invalid GitHub repository URL');
            return;
        }

        this.owner = match[1];
        this.repo = match[2].replace(/\.git$/, '');
        this.branch = options.branch || 'main';
        this.maxFileSize = options.maxFileSize || 100000; // 100KB default
        this.excludedPaths = options.excludedPaths || ['.git', 'node_modules', '.vs', 'Binaries', 'DerivedDataCache', 'Intermediate', 'Saved', 'Build'];
        
        this.fileTree = null;
        this.selectedFile = null;
        this.init();
    }

    init() {
        this.render();
        this.loadRepository();
    }

    render() {
        this.container.innerHTML = `
            <div class="code-browser">
                <div class="code-browser-header">
                    <h3>Code Explorer</h3>
                    <div class="code-browser-info">
                        <span class="repo-name">${this.owner}/${this.repo}</span>
                        <a href="https://github.com/${this.owner}/${this.repo}" target="_blank" class="github-link">
                            <i class="fa-brands fa-github"></i> View on GitHub
                        </a>
                    </div>
                </div>
                <div class="code-browser-content">
                    <div class="code-browser-sidebar">
                        <div class="file-tree-container">
                            <div class="loading">Loading repository structure...</div>
                        </div>
                    </div>
                    <div class="code-browser-main">
                        <div class="file-viewer">
                            <div class="file-viewer-placeholder">
                                <i class="fa-solid fa-file-code"></i>
                                <p>Select a file from the tree to view its contents</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async loadRepository() {
        try {
            const tree = await this.fetchRepositoryTree();
            this.fileTree = this.buildFileTree(tree);
            this.renderFileTree();
        } catch (error) {
            console.error('Error loading repository:', error);
            this.showError('Failed to load repository. Make sure the repository is public.');
        }
    }

    async fetchRepositoryTree() {
        // First, get the SHA of the branch
        const branchUrl = `https://api.github.com/repos/${this.owner}/${this.repo}/branches/${this.branch}`;
        const branchResponse = await fetch(branchUrl);
        
        if (!branchResponse.ok) {
            // Try 'master' if 'main' fails
            if (this.branch === 'main') {
                this.branch = 'master';
                return this.fetchRepositoryTree();
            }
            throw new Error(`Failed to fetch branch: ${branchResponse.statusText}`);
        }
        
        const branchData = await branchResponse.json();
        const treeSha = branchData.commit.commit.tree.sha;

        // Get the recursive tree
        const treeUrl = `https://api.github.com/repos/${this.owner}/${this.repo}/git/trees/${treeSha}?recursive=1`;
        const treeResponse = await fetch(treeUrl);
        
        if (!treeResponse.ok) {
            throw new Error(`Failed to fetch tree: ${treeResponse.statusText}`);
        }
        
        const treeData = await treeResponse.json();
        return treeData.tree.filter(item => item.type === 'blob'); // Only files, not directories
    }

    buildFileTree(files) {
        const tree = {};
        
        files.forEach(file => {
            // Skip excluded paths
            if (this.excludedPaths.some(excluded => file.path.includes(excluded))) {
                return;
            }

            const parts = file.path.split('/');
            let current = tree;
            
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const isLast = i === parts.length - 1;
                
                if (isLast) {
                    current[part] = {
                        type: 'file',
                        path: file.path,
                        sha: file.sha,
                        size: file.size
                    };
                } else {
                    if (!current[part]) {
                        current[part] = {
                            type: 'folder',
                            children: {}
                        };
                    }
                    current = current[part].children;
                }
            }
        });
        
        return tree;
    }

    renderFileTree() {
        const container = this.container.querySelector('.file-tree-container');
        container.innerHTML = '';
        
        const treeElement = this.createTreeElement(this.fileTree, '');
        container.appendChild(treeElement);
    }

    createTreeElement(tree, prefix) {
        const ul = document.createElement('ul');
        ul.className = 'file-tree';
        
        const entries = Object.keys(tree).sort((a, b) => {
            const aIsFolder = tree[a].type === 'folder';
            const bIsFolder = tree[b].type === 'folder';
            
            if (aIsFolder && !bIsFolder) return -1;
            if (!aIsFolder && bIsFolder) return 1;
            return a.localeCompare(b);
        });
        
        entries.forEach(name => {
            const item = tree[name];
            const li = document.createElement('li');
            
            if (item.type === 'folder') {
                li.className = 'tree-folder';
                li.innerHTML = `
                    <span class="tree-toggle">
                        <i class="fa-solid fa-chevron-right"></i>
                    </span>
                    <span class="tree-icon">
                        <i class="fa-solid fa-folder"></i>
                    </span>
                    <span class="tree-name">${name}</span>
                `;
                
                const children = this.createTreeElement(item.children, prefix + name + '/');
                children.style.display = 'none';
                li.appendChild(children);
                
                li.querySelector('.tree-toggle').addEventListener('click', (e) => {
                    e.stopPropagation();
                    const icon = li.querySelector('.tree-toggle i');
                    const isExpanded = children.style.display !== 'none';
                    children.style.display = isExpanded ? 'none' : 'block';
                    icon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(90deg)';
                });
            } else {
                li.className = 'tree-file';
                li.innerHTML = `
                    <span class="tree-toggle" style="width: 16px;"></span>
                    <span class="tree-icon">
                        <i class="fa-solid fa-file-code"></i>
                    </span>
                    <span class="tree-name">${name}</span>
                `;
                
                li.addEventListener('click', () => {
                    this.selectFile(item.path, item.size);
                });
            }
            
            ul.appendChild(li);
        });
        
        return ul;
    }

    async selectFile(path, size) {
        // Remove previous selection
        this.container.querySelectorAll('.tree-file').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Add selection to clicked file
        event.currentTarget.classList.add('selected');
        
        // Check file size
        if (size > this.maxFileSize) {
            this.showFileViewer(`File too large to display (${this.formatFileSize(size)}). Please view on GitHub.`);
            return;
        }
        
        // Show loading
        this.showFileViewer('Loading file...');
        
        try {
            const content = await this.fetchFileContent(path);
            this.displayFile(path, content);
        } catch (error) {
            console.error('Error loading file:', error);
            this.showFileViewer('Failed to load file. Please try again or view on GitHub.');
        }
    }

    async fetchFileContent(path) {
        const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.encoding === 'base64') {
            return atob(data.content);
        }
        
        return data.content;
    }

    displayFile(path, content) {
        const viewer = this.container.querySelector('.file-viewer');
        const fileName = path.split('/').pop();
        const extension = fileName.split('.').pop();
        const language = this.detectLanguage(extension);
        
        viewer.innerHTML = `
            <div class="file-viewer-header">
                <span class="file-path">${path}</span>
                <div class="file-viewer-actions">
                    <a href="https://github.com/${this.owner}/${this.repo}/blob/${this.branch}/${path}" target="_blank" class="view-on-github">
                        <i class="fa-brands fa-github"></i> View on GitHub
                    </a>
                </div>
            </div>
            <div class="file-viewer-content">
                <pre><code class="language-${language}">${this.escapeHtml(content)}</code></pre>
            </div>
        `;
        
        // Highlight syntax if Prism is available
        if (window.Prism) {
            Prism.highlightElement(viewer.querySelector('code'));
        }
    }

    showFileViewer(message) {
        const viewer = this.container.querySelector('.file-viewer');
        viewer.innerHTML = `
            <div class="file-viewer-placeholder">
                <i class="fa-solid fa-info-circle"></i>
                <p>${message}</p>
            </div>
        `;
    }

    detectLanguage(extension) {
        const languageMap = {
            'js': 'javascript',
            'jsx': 'javascript',
            'ts': 'typescript',
            'tsx': 'typescript',
            'py': 'python',
            'cpp': 'cpp',
            'c': 'c',
            'h': 'cpp',
            'hpp': 'cpp',
            'cs': 'csharp',
            'java': 'java',
            'html': 'html',
            'css': 'css',
            'scss': 'css',
            'json': 'json',
            'xml': 'xml',
            'sh': 'bash',
            'md': 'markdown',
            'yml': 'yaml',
            'yaml': 'yaml'
        };
        
        return languageMap[extension.toLowerCase()] || 'text';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    showError(message) {
        const container = this.container.querySelector('.file-tree-container');
        container.innerHTML = `<div class="error">${message}</div>`;
    }
}

// Auto-initialize code browsers on page load
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('[data-code-browser]').forEach(element => {
        const repoUrl = element.getAttribute('data-repo-url');
        const branch = element.getAttribute('data-branch') || 'main';
        const maxFileSize = parseInt(element.getAttribute('data-max-file-size')) || 100000;
        
        const excludedPaths = element.getAttribute('data-excluded-paths');
        const excludedPathsArray = excludedPaths ? excludedPaths.split(',') : [];
        
        new GitHubCodeBrowser(element.id, repoUrl, {
            branch: branch,
            maxFileSize: maxFileSize,
            excludedPaths: excludedPathsArray
        });
    });
});
