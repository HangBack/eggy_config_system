// API接口配置
const API_BASE = 'http://localhost:5001/api';

const API = {
    SCHEMA: `${API_BASE}/schema`,
    ENUM: `${API_BASE}/enum`,
    DATA: `${API_BASE}/data`,
    LUA_TYPES: `${API_BASE}/lua-types`,
    PROJECTS: `${API_BASE}/projects`
};

// ==================== 项目管理 ====================

// 当前项目名称
let currentProject = 'default';

/**
 * 获取当前项目参数字符串
 * @returns {string} 项目参数字符串，如 "project=myProject"
 */
function getProjectParam() {
    return `project=${encodeURIComponent(currentProject)}`;
}

/**
 * 获取带项目参数的API URL
 * @param {string} baseUrl - 基础API URL
 * @param {object} params - 其他参数
 * @returns {string} 完整的URL
 */
function getApiUrl(baseUrl, params = {}) {
    const allParams = { project: currentProject, ...params };
    const queryString = Object.entries(allParams)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
    return `${baseUrl}?${queryString}`;
}

/**
 * 加载项目列表
 */
async function loadProjects() {
    try {
        const response = await fetch(API.PROJECTS);
        const result = await response.json();
        
        if (result.success) {
            const projects = result.data;
            const select = document.getElementById('project-select');
            if (select) {
                select.innerHTML = projects.map(p => 
                    `<option value="${escapeHtml(p.name)}" ${p.name === currentProject ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
                ).join('');
            }
            return projects;
        }
    } catch (error) {
        console.error('加载项目列表失败:', error);
    }
    return [];
}

/**
 * 切换项目
 */
async function switchProject(projectName) {
    if (projectName === currentProject) return;
    
    currentProject = projectName;
    updateUrlParams();
    
    // 清空当前编辑状态
    clearCurrentEditState();
    
    // 重新加载当前面板的数据
    const activeTab = document.querySelector('.nav-tab.active');
    if (activeTab) {
        const tabName = activeTab.dataset.tab;
        await reloadCurrentPanel(tabName);
    }
    
    showSuccess(`已切换到项目: ${projectName}`);
}

/**
 * 清空当前编辑状态
 */
function clearCurrentEditState() {
    // 清空 Schema 编辑状态
    currentSchema = null;
    currentSchemaName = '';
    selectedFieldIndex = -1;
    const schemaEditor = document.getElementById('schema-editor');
    if (schemaEditor) {
        schemaEditor.style.display = 'none';
    }
    
    // 清空枚举编辑状态
    if (typeof currentEnum !== 'undefined') {
        currentEnum = null;
    }
    if (typeof currentEnumName !== 'undefined') {
        currentEnumName = '';
    }
    const enumContentEditor = document.getElementById('enum-content-editor');
    if (enumContentEditor) {
        enumContentEditor.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-hand-pointer"></i>
                <p>请从左侧选择或添加枚举文件</p>
            </div>
        `;
    }
    
    // 清空配表编辑状态
    selectedDataRowIndex = -1;
    dataRows = [];
    const dataEditor = document.getElementById('data-editor');
    if (dataEditor) {
        dataEditor.style.display = 'none';
    }
    const dataSchemaSelect = document.getElementById('data-schema-select');
    if (dataSchemaSelect) {
        dataSchemaSelect.value = '';
    }
}

/**
 * 重新加载当前面板数据
 */
async function reloadCurrentPanel(tabName) {
    switch (tabName) {
        case 'schema':
            await loadSchemas();
            break;
        case 'enum':
            await loadEnums();
            break;
        case 'data':
            await loadSchemaSelectOptions();
            break;
    }
}

/**
 * 打开项目管理模态框
 */
async function openProjectModal() {
    const modal = document.getElementById('project-modal');
    modal.classList.add('show');
    
    await renderProjectList();
}

/**
 * 关闭项目管理模态框
 */
function closeProjectModal() {
    const modal = document.getElementById('project-modal');
    modal.classList.remove('show');
}

/**
 * 渲染项目列表
 */
async function renderProjectList() {
    const projects = await loadProjects();
    const listContainer = document.getElementById('project-list');
    
    if (projects.length === 0) {
        listContainer.innerHTML = '<div class="project-list-item"><span class="text-muted">暂无项目</span></div>';
        return;
    }
    
    listContainer.innerHTML = projects.map(p => `
        <div class="project-list-item ${p.name === currentProject ? 'active' : ''}" data-name="${escapeHtml(p.name)}">
            <div class="project-info">
                <span class="project-name">
                    <i class="fas fa-folder${p.name === currentProject ? '-open' : ''}"></i>
                    ${escapeHtml(p.name)}
                </span>
                <span class="project-stats">
                    ${p.schemaCount} 个Schema，${p.enumCount} 个枚举
                </span>
            </div>
            <div class="project-actions">
                ${p.name !== 'default' ? `
                    <button class="btn btn-danger btn-sm" onclick="deleteProject('${escapeHtml(p.name)}')" title="删除项目">
                        <i class="fas fa-trash"></i>
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

/**
 * 创建新项目
 */
async function createProject() {
    const nameInput = document.getElementById('new-project-name');
    const name = nameInput.value.trim();
    
    if (!name) {
        showError('请输入项目名称');
        return;
    }
    
    if (!/^[\w\-]+$/.test(name)) {
        showError('项目名称只能包含字母、数字、下划线和中划线');
        return;
    }
    
    try {
        const response = await fetch(API.PROJECTS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', name })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess(`项目 "${name}" 创建成功`);
            nameInput.value = '';
            await renderProjectList();
            await loadProjects();
        } else {
            showError(result.error || '创建项目失败');
        }
    } catch (error) {
        console.error('创建项目失败:', error);
        showError('创建项目失败');
    }
}

/**
 * 删除项目
 */
async function deleteProject(name) {
    if (name === 'default') {
        showError('不能删除默认项目');
        return;
    }
    
    if (name === currentProject) {
        showError('不能删除当前正在使用的项目');
        return;
    }
    
    showModal(`确定要删除项目 "${name}" 吗？此操作不可撤销！`, async () => {
        try {
            const response = await fetch(API.PROJECTS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete', name })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showSuccess(`项目 "${name}" 已删除`);
                await renderProjectList();
                await loadProjects();
            } else {
                showError(result.error || '删除项目失败');
            }
        } catch (error) {
            console.error('删除项目失败:', error);
            showError('删除项目失败');
        }
    });
}

// ==================== URL 路由管理 ====================

/**
 * 解析URL参数并初始化状态
 */
function parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    
    // 读取项目
    const project = params.get('project');
    if (project) {
        currentProject = project;
    }
    
    // 读取标签页
    const tab = params.get('tab');
    
    // 读取具体项目
    const schema = params.get('schema');
    const enumName = params.get('enum');
    const data = params.get('data');
    const row = params.get('row');
    const preview = params.get('preview') === 'true';
    
    return { project, tab, schema, enumName, data, row, preview };
}

/**
 * 更新URL参数（不刷新页面）
 */
function updateUrlParams() {
    const params = new URLSearchParams();
    
    // 项目（始终显示）
    params.set('project', currentProject);
    
    // 当前标签页
    const activeTab = document.querySelector('.nav-tab.active');
    if (activeTab) {
        const tabName = activeTab.dataset.tab;
        params.set('tab', tabName);
        
        // 根据标签页添加具体参数
        switch (tabName) {
            case 'schema':
                if (currentSchemaName) {
                    params.set('schema', currentSchemaName);
                }
                break;
            case 'enum':
                if (typeof currentEnumName !== 'undefined' && currentEnumName) {
                    params.set('enum', currentEnumName);
                }
                break;
            case 'data':
                const dataSelect = document.getElementById('data-schema-select');
                if (dataSelect && dataSelect.value) {
                    params.set('data', dataSelect.value);
                    if (selectedDataRowIndex >= 0) {
                        params.set('row', selectedDataRowIndex);
                    }
                    // 检查预览模态框是否打开
                    const previewModal = document.getElementById('preview-modal');
                    if (previewModal && previewModal.classList.contains('show')) {
                        params.set('preview', 'true');
                    }
                }
                break;
        }
    }
    
    // 更新URL
    const newUrl = params.toString() 
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
    
    window.history.replaceState({}, '', newUrl);
}

/**
 * 复制当前页面链接
 */
function copyCurrentLink() {
    updateUrlParams();
    const url = window.location.href;
    
    navigator.clipboard.writeText(url).then(() => {
        showSuccess('链接已复制到剪贴板');
    }).catch(err => {
        // 回退方案
        const textarea = document.createElement('textarea');
        textarea.value = url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showSuccess('链接已复制到剪贴板');
    });
}

/**
 * 根据URL参数恢复状态
 */
async function restoreStateFromUrl() {
    const { project, tab, schema, enumName, data, row, preview } = parseUrlParams();
    
    // 设置项目
    if (project) {
        currentProject = project;
        const select = document.getElementById('project-select');
        if (select) {
            select.value = project;
        }
    }
    
    // 切换标签页
    if (tab && ['schema', 'enum', 'data'].includes(tab)) {
        switchTab(tab);
        
        // 等待数据加载完成后恢复具体状态
        await new Promise(resolve => setTimeout(resolve, 500));
        
        switch (tab) {
            case 'schema':
                if (schema) {
                    // 等待 schema 列表加载完成
                    await new Promise(resolve => setTimeout(resolve, 300));
                    // 直接调用 editSchema 函数
                    if (typeof editSchema === 'function') {
                        editSchema(schema);
                    }
                }
                break;
            case 'enum':
                if (enumName) {
                    // 等待 enum 列表加载完成
                    await new Promise(resolve => setTimeout(resolve, 300));
                    // 直接调用 editEnum 函数
                    if (typeof editEnum === 'function') {
                        editEnum(enumName);
                    }
                }
                break;
            case 'data':
                if (data) {
                    const dataSelect = document.getElementById('data-schema-select');
                    if (dataSelect) {
                        dataSelect.value = data;
                        await loadDataForSchema();
                        
                        if (row !== null && row !== undefined) {
                            const rowIndex = parseInt(row);
                            if (!isNaN(rowIndex)) {
                                // 等待数据行列表渲染
                                await new Promise(resolve => setTimeout(resolve, 300));
                                selectDataRow(rowIndex);
                            }
                        }
                        
                        // 如果URL中有preview参数，自动打开预览
                        if (preview && typeof previewData === 'function') {
                            await new Promise(resolve => setTimeout(resolve, 200));
                            previewData();
                        }
                    }
                }
                break;
        }
    }
}

// ==================== Toaster 通知系统 ====================

/**
 * 显示 Toaster 通知
 * @param {string} message - 通知消息
 * @param {string} type - 通知类型: 'success', 'error', 'warning', 'info'
 * @param {number} duration - 显示时长（毫秒），默认 3000
 */
function showToast(message, type = 'info', duration = 3000) {
    // 创建 toaster 容器（如果不存在）
    let container = document.getElementById('toaster-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toaster-container';
        container.className = 'toaster-container';
        document.body.appendChild(container);
    }

    // 创建 toast 元素
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // 图标映射
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    const icon = icons[type] || icons.info;
    
    toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <span class="toast-message">${escapeHtml(message)}</span>
    `;
    
    // 添加到容器
    container.appendChild(toast);
    
    // 触发动画
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // 自动移除
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            container.removeChild(toast);
            // 如果容器为空，移除容器
            if (container.children.length === 0) {
                document.body.removeChild(container);
            }
        }, 300);
    }, duration);
}

// 便捷方法
function showSuccess(message, duration) {
    showToast(message, 'success', duration);
}

function showError(message, duration) {
    showToast(message, 'error', duration);
}

function showWarning(message, duration) {
    showToast(message, 'warning', duration);
}

function showInfo(message, duration) {
    showToast(message, 'info', duration);
}

// 工具函数：将纯数字字符串转换为数字键，用于对象访问
function normalizeFieldKey(fieldName) {
    // 检查是否为纯数字字符串
    if (typeof fieldName === 'string' && /^\d+$/.test(fieldName)) {
        return parseInt(fieldName, 10);
    }
    return fieldName;
}

// 工具函数：从对象中获取字段值，支持数字键
function getFieldValue(obj, fieldName) {
    if (!obj) return undefined;
    
    // 先尝试直接访问
    if (obj[fieldName] !== undefined) {
        return obj[fieldName];
    }
    
    // 如果字段名是纯数字字符串，尝试用数字键访问
    const numKey = normalizeFieldKey(fieldName);
    if (numKey !== fieldName && obj[numKey] !== undefined) {
        return obj[numKey];
    }
    
    return undefined;
}

// 工具函数：设置对象字段值，如果字段名是纯数字则使用数字键
function setFieldValue(obj, fieldName, value) {
    if (!obj) return;
    
    const key = normalizeFieldKey(fieldName);
    obj[key] = value;
}

// 全局状态
let currentSchema = null;
let currentSchemaName = '';
let schemas = [];
let isEditMode = false;
let selectedFieldIndex = -1;
let selectedDataRowIndex = -1;
let dataRows = [];

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupGlobalKeyboardShortcuts();
});

// 全局键盘快捷键
function setupGlobalKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+S 保存
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            // 检查是否在 CodeMirror 编辑器中
            const target = e.target;
            if (target && target.closest && target.closest('.CodeMirror')) {
                // 在 CodeMirror 中，让 CodeMirror 自己处理
                return;
            }
            
            e.preventDefault();
            handleGlobalSave();
        }
    });
}

// 处理全局保存，根据当前状态判断保存哪里
function handleGlobalSave() {
    // 检查是否有打开的模态框
    const openModals = document.querySelectorAll('.modal.show');
    
    // 如果有模态框打开，优先处理模态框中的保存
    for (const modal of openModals) {
        const modalId = modal.id;
        
        // 脚本帮助模态框 - 没有保存按钮，跳过
        if (modalId === 'script-help-modal') {
            continue;
        }
        
        // Lua导出模态框 - 没有真正的保存，但不拦截
        if (modalId === 'export-lua-modal') {
            return;
        }
        
        // 其他模态框不处理 Ctrl+S
        return;
    }
    
    // 没有模态框打开，根据当前激活的面板决定保存行为
    const activeTab = document.querySelector('.nav-tab.active');
    if (!activeTab) return;
    
    const tabName = activeTab.dataset.tab;
    
    switch (tabName) {
        case 'schema':
            // Schema 面板
            const schemaEditor = document.getElementById('schema-editor');
            if (schemaEditor && schemaEditor.style.display !== 'none') {
                // 正在编辑 Schema
                saveSchema();
            }
            break;
            
        case 'enum':
            // 枚举面板
            const enumEditor = document.getElementById('enum-editor');
            if (enumEditor && enumEditor.style.display !== 'none') {
                // 正在编辑枚举
                saveEnum();
            }
            break;
            
        case 'data':
            // 配表面板
            const dataEditor = document.getElementById('data-editor');
            if (dataEditor && dataEditor.style.display !== 'none') {
                // 检查是否在预览面板且脚本编辑器有焦点
                const previewPanel = document.querySelector('.data-preview-panel');
                if (previewPanel && previewPanel.style.display !== 'none') {
                    // 在预览面板中，保存脚本
                    if (typeof savePreviewScript === 'function') {
                        savePreviewScript(false);
                    }
                } else {
                    // 在数据编辑面板中，保存数据
                    saveData();
                }
            }
            break;
    }
}

function initializeApp() {
    // 解析URL参数
    parseUrlParams();
    
    // 初始化标签指示器
    initTabIndicator();
    
    // 绑定导航标签切换
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchTab(tab.dataset.tab);
            updateUrlParams();
        });
    });
    
    // 绑定项目选择器事件
    const projectSelect = document.getElementById('project-select');
    if (projectSelect) {
        projectSelect.addEventListener('change', (e) => {
            switchProject(e.target.value);
        });
    }
    
    // 绑定项目管理按钮
    const manageProjectsBtn = document.getElementById('manage-projects-btn');
    if (manageProjectsBtn) {
        manageProjectsBtn.addEventListener('click', openProjectModal);
    }
    
    // 绑定复制链接按钮
    const copyLinkBtn = document.getElementById('copy-link-btn');
    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', copyCurrentLink);
    }
    
    // 绑定创建项目按钮
    const createProjectBtn = document.getElementById('create-project-btn');
    if (createProjectBtn) {
        createProjectBtn.addEventListener('click', createProject);
    }
    
    // 绑定新项目名称输入框回车事件
    const newProjectName = document.getElementById('new-project-name');
    if (newProjectName) {
        newProjectName.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                createProject();
            }
        });
    }

    // 绑定Schema面板事件
    document.getElementById('add-schema-btn').addEventListener('click', addNewSchema);
    document.getElementById('save-schema-btn').addEventListener('click', saveSchema);
    document.getElementById('cancel-schema-btn').addEventListener('click', cancelSchemaEdit);
    document.getElementById('add-field-btn').addEventListener('click', addField);
    
    // 绑定Schema搜索事件
    const schemaSearch = document.getElementById('schema-search');
    if (schemaSearch) {
        schemaSearch.addEventListener('input', searchSchemas);
    }

    // 绑定枚举面板事件
    document.getElementById('add-enum-btn').addEventListener('click', addNewEnum);
    document.getElementById('save-enum-btn').addEventListener('click', saveEnum);
    document.getElementById('export-enum-lua-btn').addEventListener('click', exportEnumToLua);
    document.getElementById('preview-enum-btn').addEventListener('click', previewEnumValues);
    
    // 绑定枚举文件搜索事件
    const enumFilesSearch = document.getElementById('enum-files-search');
    if (enumFilesSearch) {
        enumFilesSearch.addEventListener('input', searchEnumFiles);
    }
    
    // 绑定侧边栏添加枚举按钮
    const addEnumSidebarBtn = document.getElementById('add-enum-sidebar-btn');
    if (addEnumSidebarBtn) {
        addEnumSidebarBtn.addEventListener('click', addNewEnum);
    }

    // 绑定填充枚举模态框事件
    document.getElementById('confirm-fill-enum-btn').addEventListener('click', confirmFillFromEnum);
    document.getElementById('cancel-fill-enum-btn').addEventListener('click', closeFillEnumModal);
    document.getElementById('close-enum-preview-btn').addEventListener('click', closeEnumPreviewModal);
    
    // 绑定枚举导出模态框事件
    document.getElementById('copy-enum-lua-btn').addEventListener('click', copyEnumLuaCode);
    document.getElementById('download-enum-btn').addEventListener('click', downloadEnumLuaFile);

    // 绑定配表面板事件
    document.getElementById('data-schema-select').addEventListener('change', loadDataForSchema);
    document.getElementById('add-data-row-btn').addEventListener('click', addDataRow);
    document.getElementById('save-data-btn').addEventListener('click', saveData);
    document.getElementById('import-data-btn').addEventListener('click', openImportDataModal);
    document.getElementById('preview-data-btn').addEventListener('click', previewData);
    document.getElementById('export-lua-btn').addEventListener('click', exportToLua);
    
    // 绑定数据行搜索事件
    const dataRowsSearch = document.getElementById('data-rows-search');
    if (dataRowsSearch) {
        dataRowsSearch.addEventListener('input', () => {
            renderDataRowsList();
        });
    }

    // 绑定导出Lua模态框事件
    document.getElementById('copy-lua-btn').addEventListener('click', copyLuaCode);
    document.getElementById('download-export-btn').addEventListener('click', downloadExportFile);
    document.getElementById('export-format-select').addEventListener('change', updateLuaExport);
    document.getElementById('export-namespace').addEventListener('input', updateLuaExport);
    document.getElementById('export-table-key-type').addEventListener('input', updateLuaExport);
    
    // 绑定预览下载按钮
    document.getElementById('download-preview-btn').addEventListener('click', downloadPreviewCsv);
    
    // 绑定导入模态框事件
    document.getElementById('import-file-input').addEventListener('change', onImportFileSelected);
    document.getElementById('confirm-import-btn').addEventListener('click', confirmImport);

    // 绑定模态框事件
    document.getElementById('cancel-delete-btn').addEventListener('click', closeModal);
    
    // 绑定滚动按钮事件
    setupScrollButtons();

    // 异步加载数据
    Promise.all([
        loadProjects(),        // 加载项目列表
        loadLuaValueTypes(),   // 加载Lua ValueType数据
        loadSchemas()          // 加载Schema列表
    ]).then(() => {
        console.log('初始化完成');
        // 恢复URL状态
        restoreStateFromUrl();
    }).catch(error => {
        console.error('初始化失败:', error);
    });
}

// ==================== 滚动按钮功能 ====================

let currentScrollTarget = null;

function setupScrollButtons() {
    const scrollTopBtn = document.getElementById('scroll-top-btn');
    const scrollBottomBtn = document.getElementById('scroll-bottom-btn');
    const scrollButtons = document.getElementById('scroll-buttons');
    
    if (!scrollTopBtn || !scrollBottomBtn || !scrollButtons) return;
    
    scrollTopBtn.addEventListener('click', () => {
        if (currentScrollTarget) {
            currentScrollTarget.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
    
    scrollBottomBtn.addEventListener('click', () => {
        if (currentScrollTarget) {
            currentScrollTarget.scrollTo({ top: currentScrollTarget.scrollHeight, behavior: 'smooth' });
        }
    });
    
    // 监听可能需要滚动按钮的容器
    const scrollableContainers = [
        'data-row-editor-container',  // 配表编辑器
        'enum-content-editor',        // 枚举编辑器
        'editor-main'                 // 通用编辑器主区域
    ];
    
    // 使用 MutationObserver 监听内容变化
    const observer = new MutationObserver(() => {
        updateScrollButtonsVisibility();
    });
    
    // 监听所有面板变化
    document.querySelectorAll('.panel').forEach(panel => {
        observer.observe(panel, { childList: true, subtree: true, attributes: true });
    });
    
    // 监听滚动事件（包括窗口滚动）
    document.addEventListener('scroll', updateScrollButtonsVisibility, true);
    window.addEventListener('scroll', updateScrollButtonsVisibility);
    window.addEventListener('resize', updateScrollButtonsVisibility);
    
    // 监听鼠标进入可滚动区域
    scrollableContainers.forEach(className => {
        document.querySelectorAll(`.${className}, #${className}`).forEach(container => {
            container.addEventListener('mouseenter', () => {
                checkAndSetScrollTarget(container);
            });
        });
    });
    
    // 初始更新（延迟执行确保DOM完全加载）
    setTimeout(updateScrollButtonsVisibility, 500);
}

function checkAndSetScrollTarget(container) {
    const scrollButtons = document.getElementById('scroll-buttons');
    if (!scrollButtons) return;
    
    // 检查容器是否需要滚动
    if (container.scrollHeight > container.clientHeight + 50) {
        currentScrollTarget = container;
        scrollButtons.classList.add('visible');
    }
}

function updateScrollButtonsVisibility() {
    const scrollButtons = document.getElementById('scroll-buttons');
    if (!scrollButtons) return;
    
    // 获取当前激活的面板
    const activeTab = document.querySelector('.nav-tab.active');
    if (!activeTab) return;
    
    const tabName = activeTab.dataset.tab;
    let scrollableContainer = null;
    
    switch (tabName) {
        case 'data':
            scrollableContainer = document.getElementById('data-row-editor-container');
            break;
        case 'enum':
            // 枚举编辑器的滚动容器是 .editor-main，不是 #enum-content-editor
            scrollableContainer = document.querySelector('#enum-panel .editor-main');
            break;
        case 'schema':
            scrollableContainer = document.querySelector('#schema-panel .editor-main');
            break;
    }
    
    // 首先检查特定容器是否可滚动
    if (scrollableContainer && scrollableContainer.scrollHeight > scrollableContainer.clientHeight + 50) {
        currentScrollTarget = scrollableContainer;
        scrollButtons.classList.add('visible');
        return;
    }
    
    // 如果特定容器不可滚动，检查整个页面是否可滚动
    const documentHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
    );
    const viewportHeight = window.innerHeight;
    
    if (documentHeight > viewportHeight + 50) {
        currentScrollTarget = document.documentElement;
        scrollButtons.classList.add('visible');
    } else {
        currentScrollTarget = null;
        scrollButtons.classList.remove('visible');
    }
}

// ==================== 模糊匹配工具函数 ====================

/**
 * 计算模糊匹配分数 - 支持不连续字符匹配
 * @param {string} text - 要匹配的文本
 * @param {string} search - 搜索关键词
 * @returns {number} 匹配分数，0表示不匹配，分数越高表示匹配度越好
 */
function fuzzyMatchScore(text, search) {
    if (!text || !search) return 0;
    
    text = text.toLowerCase();
    search = search.toLowerCase();
    
    // 完全匹配得分最高
    if (text === search) return 1000;
    
    // 前缀匹配得分次之
    if (text.startsWith(search)) return 500;
    
    // 包含连续子串
    if (text.includes(search)) return 300;
    
    // 模糊匹配得分
    let score = 0;
    let searchIndex = 0;
    let consecutiveMatches = 0;
    let lastMatchIndex = -1;
    
    for (let i = 0; i < text.length && searchIndex < search.length; i++) {
        if (text[i] === search[searchIndex]) {
            searchIndex++;
            // 连续匹配加分
            if (i === lastMatchIndex + 1) {
                consecutiveMatches++;
                score += consecutiveMatches * 10;
            } else {
                consecutiveMatches = 1;
                score += 5;
            }
            lastMatchIndex = i;
        }
    }
    
    // 如果没有匹配完所有搜索字符，返回0
    return searchIndex === search.length ? score : 0;
}

/**
 * 模糊匹配并排序
 * @param {Array} items - 要过滤的项目数组
 * @param {string} search - 搜索关键词
 * @param {Function} getTexts - 获取每个项目的文本内容的函数，返回字符串或字符串数组
 * @returns {Array} 过滤并排序后的结果
 */
function fuzzyFilterAndSort(items, search, getTexts) {
    if (!search) return items;
    
    const matchedItems = items
        .map(item => {
            const texts = getTexts(item);
            const textArray = Array.isArray(texts) ? texts : [texts];
            
            // 计算所有文本的最高分数
            const maxScore = Math.max(...textArray.map(text => fuzzyMatchScore(text, search)));
            
            return {
                item,
                score: maxScore
            };
        })
        .filter(item => item.score > 0) // 只保留有匹配的
        .sort((a, b) => b.score - a.score); // 按分数降序排列
    
    return matchedItems.map(item => item.item);
}

// ========== 标签切换 ==========

// 初始化标签指示器
function initTabIndicator() {
    const activeTab = document.querySelector('.nav-tab.active');
    if (activeTab) {
        updateTabIndicator(activeTab, false);
    }
    
    // 监听窗口大小变化，更新指示器位置
    window.addEventListener('resize', () => {
        const activeTab = document.querySelector('.nav-tab.active');
        if (activeTab) {
            updateTabIndicator(activeTab, false);
        }
    });
}

// 更新标签指示器位置
function updateTabIndicator(tab, animate = true) {
    const indicator = document.querySelector('.nav-tab-indicator');
    const navTabs = document.querySelector('.nav-tabs');
    
    if (!indicator || !navTabs || !tab) return;
    
    const navRect = navTabs.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    
    // 计算相对于nav-tabs的位置
    const left = tabRect.left - navRect.left;
    const width = tabRect.width;
    
    if (!animate) {
        indicator.style.transition = 'none';
    }
    
    indicator.style.left = left + 'px';
    indicator.style.width = width + 'px';
    
    if (!animate) {
        // 强制重绘后恢复过渡
        indicator.offsetHeight;
        indicator.style.transition = '';
    }
}

function switchTab(tabName) {
    // 更新标签样式
    document.querySelectorAll('.nav-tab').forEach(tab => {
        const isActive = tab.dataset.tab === tabName;
        tab.classList.toggle('active', isActive);
        
        // 更新指示器位置
        if (isActive) {
            updateTabIndicator(tab, true);
        }
    });

    // 显示对应面板
    document.getElementById('schema-panel').style.display = tabName === 'schema' ? 'block' : 'none';
    document.getElementById('enum-panel').style.display = tabName === 'enum' ? 'block' : 'none';
    document.getElementById('data-panel').style.display = tabName === 'data' ? 'block' : 'none';

    // 如果切换到枚举面板，加载枚举列表并显示编辑器界面
    if (tabName === 'enum') {
        loadEnums().then(() => {
            // 显示编辑器布局
            const enumEditor = document.getElementById('enum-editor');
            if (enumEditor) {
                enumEditor.style.display = 'flex';
            }
            // 如果没有选中的枚举，显示空状态
            if (!currentEnumName) {
                const enumContentEditor = document.getElementById('enum-content-editor');
                if (enumContentEditor) {
                    enumContentEditor.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-hand-pointer"></i>
                            <p>请从左侧选择或添加枚举文件</p>
                        </div>
                    `;
                }
            }
            // 更新滚动按钮可见性
            setTimeout(updateScrollButtonsVisibility, 100);
        });
    }

    // 如果切换到配表面板，加载Schema列表
    if (tabName === 'data') {
        loadSchemaSelectOptions();
    }
}


function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// 颜色处理函数
function updateColorFromPicker(fieldId, hexColor) {
    // hexColor 格式: #RRGGBB
    const textInput = document.getElementById(fieldId);
    const preview = document.getElementById(`${fieldId}-preview`);
    
    if (textInput) {
        // 转换为 0xRRGGBB 格式
        const hex = hexColor.replace('#', '');
        textInput.value = '0x' + hex.toUpperCase();
    }
    
    if (preview) {
        preview.style.backgroundColor = hexColor;
    }
}

function updateColorFromText(fieldId, value) {
    const picker = document.getElementById(`${fieldId}-picker`);
    const preview = document.getElementById(`${fieldId}-preview`);
    
    // 解析输入的颜色值
    let hex = value.replace(/^0x/i, '').replace(/^#/, '');
    
    // 确保是有效的 hex 颜色
    if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
        const hexColor = '#' + hex;
        
        if (picker) {
            picker.value = hexColor;
        }
        
        if (preview) {
            preview.style.backgroundColor = hexColor;
        }
    }
}

// Boolean 切换函数
function toggleBoolean(fieldId) {
    const btn = document.getElementById(fieldId);
    if (!btn) return;
    
    const currentValue = btn.dataset.value === 'true';
    const newValue = !currentValue;
    
    btn.dataset.value = String(newValue);
    btn.classList.toggle('active', newValue);
    
    // 触发 change 事件以便保存
    btn.dispatchEvent(new Event('change', { bubbles: true }));
}

// 时间戳处理函数
// Unix 时间戳 -> datetime-local 格式（北京时区显示）
function timestampToDatetimeLocal(timestamp) {
    if (!timestamp) return '';
    const ts = parseInt(timestamp);
    if (isNaN(ts)) return '';
    
    // 创建 Date 对象（自动使用本地时区）
    const date = new Date(ts * 1000);
    
    // 格式化为 datetime-local 格式: YYYY-MM-DDTHH:mm
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

// datetime-local 输入 -> Unix 时间戳（秒）
function updateTimestampFromDatetime(fieldId, datetimeValue) {
    const hiddenInput = document.getElementById(`${fieldId}-value`);
    const displayInput = document.getElementById(fieldId);
    
    if (!datetimeValue) {
        if (hiddenInput) hiddenInput.value = '';
        return;
    }
    
    // 解析本地时间
    const date = new Date(datetimeValue);
    const timestamp = Math.floor(date.getTime() / 1000);
    
    if (hiddenInput) hiddenInput.value = timestamp;
    
    // 触发 change 事件
    if (displayInput) {
        displayInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

// 格式化时间戳为可读日期（用于预览）
function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const ts = parseInt(timestamp);
    if (isNaN(ts)) return String(timestamp);
    
    const date = new Date(ts * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function showModal(message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    const messageEl = document.getElementById('confirm-message');
    const confirmBtn = document.getElementById('confirm-delete-btn');

    messageEl.textContent = message;
    modal.classList.add('show');

    // 移除旧的事件监听器
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    // 添加新的事件监听器
    newConfirmBtn.addEventListener('click', () => {
        onConfirm();
        closeModal();
    });
}

function closeModal() {
    const modal = document.getElementById('confirm-modal');
    modal.classList.remove('show');
}

// 点击模态框外部关闭
window.addEventListener('click', (e) => {
    const confirmModal = document.getElementById('confirm-modal');
    const luaModal = document.getElementById('export-lua-modal');
    const fillEnumModal = document.getElementById('fill-enum-modal');
    const enumPreviewModal = document.getElementById('enum-preview-modal');
    const projectModal = document.getElementById('project-modal');
    
    if (e.target === confirmModal) {
        closeModal();
    }
    
    if (e.target === luaModal) {
        closeLuaExportModal();
    }
    
    if (e.target === fillEnumModal) {
        closeFillEnumModal();
    }
    
    if (e.target === enumPreviewModal) {
        closeEnumPreviewModal();
    }
    
    if (e.target === projectModal) {
        closeProjectModal();
    }
});

// ========== 枚举管理 ==========
