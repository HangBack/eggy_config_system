// ========== 枚举管理 ==========

// 枚举管理状态
let currentEnum = null;
let currentEnumName = '';
let enums = [];
let filteredEnums = [];
let isEditingEnum = false;

async function loadEnums() {
    try {
        const response = await fetch(getApiUrl(API.ENUM, { action: 'list' }));
        const result = await response.json();

        if (result.success) {
            enums = result.data;
            filteredEnums = [...enums];
            renderEnumFilesList();
        } else {
            console.error('加载枚举失败:', result.error);
            showError('加载枚举失败: ' + result.error);
        }
    } catch (error) {
        console.error('加载枚举失败:', error);
        showError('加载枚举失败，请检查网络连接');
    }
}

function renderEnumFilesList() {
    const container = document.getElementById('enum-files-list');
    container.innerHTML = '';

    if (filteredEnums.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>没有找到枚举文件</p></div>';
        return;
    }

    filteredEnums.forEach(enumData => {
        const item = document.createElement('div');
        item.className = 'enum-file-list-item';
        item.dataset.enumName = enumData.name;
        if (currentEnumName === enumData.name) {
            item.classList.add('active');
        }

        item.innerHTML = `
            <div class="enum-file-list-item-name">${enumData.name}</div>
            <div class="enum-file-list-item-desc">${enumData.description || '无描述'}</div>
        `;

        item.addEventListener('click', () => editEnum(enumData.name));
        
        // 右键菜单
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showEnumContextMenu(e.clientX, e.clientY, enumData.name);
        });

        container.appendChild(item);
    });
}

// 搜索枚举文件
function searchEnumFiles() {
    const searchTerm = document.getElementById('enum-files-search').value.trim();
    
    if (!searchTerm) {
        filteredEnums = [...enums];
    } else {
        filteredEnums = fuzzyFilterAndSort(enums, searchTerm, enumData => [
            enumData.name,
            enumData.description || ''
        ]);
    }
    
    renderEnumFilesList();
}

function addNewEnum() {
    currentEnum = {
        name: '',
        description: '',
        namespace: 'Enum',
        type: 'number',
        values: []
    };
    currentEnumName = '';
    isEditingEnum = true;

    // 显示编辑器
    document.getElementById('enum-editor').style.display = 'flex';
    document.getElementById('enum-editor-title').textContent = '新建枚举';
    document.getElementById('export-enum-lua-btn').style.display = 'none';
    document.getElementById('preview-enum-btn').style.display = 'none';

    // 渲染编辑器内容
    renderEnumContentEditor();
    
    // 更新文件列表（取消选中状态）
    renderEnumFilesList();
}

async function editEnum(name) {
    try {
        const response = await fetch(getApiUrl(API.ENUM, { action: 'get', name }));
        const result = await response.json();

        if (result.success) {
            currentEnum = result.data;
            currentEnumName = name;
            isEditingEnum = true;

            // 显示编辑器
            document.getElementById('enum-editor').style.display = 'flex';
            document.getElementById('enum-editor-title').textContent = `编辑枚举: ${name}`;
            document.getElementById('export-enum-lua-btn').style.display = 'inline-block';

            // 根据类型显示/隐藏预览按钮
            updateEnumPreviewButtonVisibility();

            // 渲染编辑器内容
            renderEnumContentEditor();

            // 更新列表中的选中状态
            renderEnumFilesList();
            
            // 更新URL参数
            updateUrlParams();
        } else {
            showError('加载枚举失败: ' + result.error);
        }
    } catch (error) {
        console.error('加载枚举失败:', error);
        showError('加载枚举失败，请检查网络连接');
    }
}

// 渲染枚举内容编辑器
function renderEnumContentEditor() {
    const container = document.getElementById('enum-content-editor');
    
    const isNew = !currentEnumName;
    
    container.innerHTML = `
        <div class="enum-basic-info-grid">
            <div class="form-group">
                <label>枚举名称</label>
                <input type="text" id="enum-name-input" class="form-control" 
                       placeholder="例如: RodCode" value="${escapeHtml(currentEnum.name)}"
                       ${isNew ? '' : 'readonly'}>
            </div>

            <div class="form-group">
                <label>枚举类型</label>
                <select id="enum-type-select" class="form-control" onchange="onEnumTypeChange()">
                    <option value="number" ${currentEnum.type === 'number' ? 'selected' : ''}>数字</option>
                    <option value="string" ${currentEnum.type === 'string' ? 'selected' : ''}>字符</option>
                    <option value="flag" ${currentEnum.type === 'flag' ? 'selected' : ''}>标志</option>
                    <option value="event" ${currentEnum.type === 'event' ? 'selected' : ''}>事件</option>
                </select>
            </div>

            <div class="form-group">
                <label>命名空间</label>
                <input type="text" id="enum-namespace-input" class="form-control" 
                       placeholder="Enum" value="${escapeHtml(currentEnum.namespace || 'Enum')}">
            </div>
            
            <div class="form-group form-group-full">
                <label>枚举描述</label>
                <input type="text" id="enum-desc-input" class="form-control" 
                       placeholder="请输入枚举描述" value="${escapeHtml(currentEnum.description || '')}">
            </div>
        </div>

        <div class="enum-values-container">
            <div class="enum-values-header">
                <h4>枚举值</h4>
                <div class="enum-values-actions">
                    <button class="btn btn-sm btn-secondary" onclick="addEnumValueBefore(-1)" title="在开头插入">
                        <i class="fas fa-arrow-up"></i> 顶部插入
                    </button>
                    <button class="btn btn-sm btn-primary" onclick="addEnumValue()">
                        <i class="fas fa-plus"></i> 添加到末尾
                    </button>
                </div>
            </div>
            <div id="enum-values-list" class="enum-values-list">
                <!-- 枚举值列表 -->
            </div>
        </div>
    `;
    
    // 渲染枚举值
    renderEnumValuesList();
}

function renderEnumValuesList() {
    const container = document.getElementById('enum-values-list');
    if (!container) return;
    
    container.innerHTML = '';

    if (!currentEnum.values || currentEnum.values.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>暂无枚举值，点击上方按钮添加</p></div>';
        return;
    }

    const enumType = currentEnum.type || 'number';

    currentEnum.values.forEach((value, index) => {
        const item = document.createElement('div');
        item.className = 'enum-value-item';
        
        // 根据枚举类型渲染不同的UI
        if (enumType === 'event') {
            // 事件枚举类型 - 多行布局
            item.innerHTML = `
                <div class="event-enum-item">
                    <div class="event-enum-row">
                        <div class="form-group">
                            <label>事件名</label>
                            <input type="text" class="form-control" value="${escapeHtml(value.key || '')}" 
                                   onchange="updateEnumValue(${index}, 'key', this.value)">
                        </div>
                        <div class="form-group">
                            <label>值</label>
                            <input type="text" class="form-control" value="${escapeHtml(value.value || '')}" 
                                   onchange="updateEnumValue(${index}, 'value', this.value)">
                        </div>
                    </div>
                    <div class="event-enum-row">
                        <div class="form-group">
                            <label>事件说明</label>
                            <textarea class="form-control" rows="2" 
                                      onchange="updateEnumValue(${index}, 'label', this.value)">${escapeHtml(value.label || '')}</textarea>
                        </div>
                    </div>
                    <div class="event-enum-row">
                        <div class="form-group event-params-group">
                            <label>注册参数</label>
                            <div class="event-params-list" id="register-params-${index}">
                                ${renderEventParams(value.registerParams || [], index, 'registerParams')}
                            </div>
                            <button type="button" class="btn btn-sm btn-secondary" onclick="addEventParam(${index}, 'registerParams')">
                                <i class="fas fa-plus"></i> 添加注册参数
                            </button>
                        </div>
                        <div class="form-group event-params-group">
                            <label>回调参数</label>
                            <div class="event-params-list" id="callback-params-${index}">
                                ${renderEventParams(value.callbackParams || [], index, 'callbackParams')}
                            </div>
                            <button type="button" class="btn btn-sm btn-secondary" onclick="addEventParam(${index}, 'callbackParams')">
                                <i class="fas fa-plus"></i> 添加回调参数
                            </button>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px;">
                        <button class="btn btn-sm btn-secondary" onclick="addEnumValueBefore(${index})" title="在上方插入">
                            <i class="fas fa-arrow-up"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="removeEnumValue(${index})">
                            <i class="fas fa-trash"></i> 删除
                        </button>
                    </div>
                </div>
            `;
        } else {
            // 普通枚举类型 - 单行布局
            const valueInputType = enumType === 'string' ? 'text' : 'number';
            const valueOnChange = enumType === 'string' 
                ? `updateEnumValue(${index}, 'value', this.value)` 
                : `updateEnumValue(${index}, 'value', parseInt(this.value))`;
            
            item.innerHTML = `
                <div class="form-group">
                    <label>键名</label>
                    <input type="text" class="form-control" value="${escapeHtml(value.key || '')}" 
                           onchange="updateEnumValue(${index}, 'key', this.value)">
                </div>
                <div class="form-group">
                    <label>值</label>
                    <input type="${valueInputType}" class="form-control" value="${escapeHtml(String(value.value || (enumType === 'string' ? '' : 0)))}" 
                           onchange="${valueOnChange}">
                </div>
                <div class="form-group">
                    <label>注释</label>
                    <input type="text" class="form-control" value="${escapeHtml(value.label || '')}" 
                           onchange="updateEnumValue(${index}, 'label', this.value)">
                </div>
                <div style="display: flex; gap: 4px; flex-direction: column; margin-top: 22px;">
                    <button class="btn btn-sm btn-secondary" onclick="addEnumValueBefore(${index})" title="在上方插入">
                        <i class="fas fa-arrow-up"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="removeEnumValue(${index})" title="删除">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        }
        container.appendChild(item);
    });
    
    // 更新预览按钮可见性
    updateEnumPreviewButtonVisibility();
    
    // 更新滚动按钮可见性
    if (typeof updateScrollButtonsVisibility === 'function') {
        setTimeout(updateScrollButtonsVisibility, 100);
    }
}

// 渲染事件参数列表
function renderEventParams(params, enumIndex, paramType) {
    if (!params || params.length === 0) {
        return '<div class="empty-params">暂无参数</div>';
    }
    
    return params.map((param, paramIndex) => `
        <div class="event-param-item">
            <input type="text" class="form-control param-key" placeholder="参数名" 
                   value="${escapeHtml(param.name || '')}"
                   onchange="updateEventParam(${enumIndex}, '${paramType}', ${paramIndex}, 'name', this.value)">
            <input type="text" class="form-control param-type" placeholder="类型" 
                   value="${escapeHtml(param.type || '')}"
                   onchange="updateEventParam(${enumIndex}, '${paramType}', ${paramIndex}, 'type', this.value)">
            <input type="text" class="form-control param-desc" placeholder="说明" 
                   value="${escapeHtml(param.description || '')}"
                   onchange="updateEventParam(${enumIndex}, '${paramType}', ${paramIndex}, 'description', this.value)">
            <button type="button" class="btn btn-sm btn-danger" onclick="removeEventParam(${enumIndex}, '${paramType}', ${paramIndex})">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

// 添加事件参数
function addEventParam(enumIndex, paramType) {
    if (!currentEnum.values[enumIndex][paramType]) {
        currentEnum.values[enumIndex][paramType] = [];
    }
    currentEnum.values[enumIndex][paramType].push({
        name: '',
        type: '',
        description: ''
    });
    renderEnumValuesList();
}

// 更新事件参数
function updateEventParam(enumIndex, paramType, paramIndex, field, value) {
    if (currentEnum.values[enumIndex][paramType] && currentEnum.values[enumIndex][paramType][paramIndex]) {
        currentEnum.values[enumIndex][paramType][paramIndex][field] = value;
    }
}

// 删除事件参数
function removeEventParam(enumIndex, paramType, paramIndex) {
    if (currentEnum.values[enumIndex][paramType]) {
        currentEnum.values[enumIndex][paramType].splice(paramIndex, 1);
        renderEnumValuesList();
    }
}

function onEnumTypeChange() {
    const nameInput = document.getElementById('enum-name-input');
    const descInput = document.getElementById('enum-desc-input');
    const namespaceInput = document.getElementById('enum-namespace-input');
    const typeSelect = document.getElementById('enum-type-select');
    
    if (currentEnum && nameInput && descInput && namespaceInput && typeSelect) {
        currentEnum.name = nameInput.value.trim();
        currentEnum.description = descInput.value.trim();
        currentEnum.namespace = namespaceInput.value.trim();
        currentEnum.type = typeSelect.value;
        
        // 重新渲染值列表以应用新的UI
        renderEnumValuesList();
    }
}

function addEnumValue() {
    if (!currentEnum.values) {
        currentEnum.values = [];
    }

    const enumType = currentEnum.type || 'number';
    
    if (enumType === 'event') {
        // 事件类型的枚举值
        currentEnum.values.push({
            key: '',
            value: '',
            label: '',
            registerParams: [],
            callbackParams: []
        });
    } else {
        // 普通枚举值
        currentEnum.values.push({
            key: '',
            value: enumType === 'string' ? '' : 0,
            label: ''
        });
    }

    renderEnumValuesList();
}

// 在指定位置前插入新的枚举值
function addEnumValueBefore(index) {
    if (!currentEnum.values) {
        currentEnum.values = [];
    }

    const enumType = currentEnum.type || 'number';
    
    let newValue;
    if (enumType === 'event') {
        newValue = {
            key: '',
            value: '',
            label: '',
            registerParams: [],
            callbackParams: []
        };
    } else {
        newValue = {
            key: '',
            value: enumType === 'string' ? '' : 0,
            label: ''
        };
    }

    if (index < 0) {
        // 插入到开头
        currentEnum.values.unshift(newValue);
    } else {
        // 插入到指定位置前
        currentEnum.values.splice(index, 0, newValue);
    }

    renderEnumValuesList();
}

function updateEnumValue(index, field, value) {
    if (currentEnum.values && currentEnum.values[index]) {
        currentEnum.values[index][field] = value;
    }
}

function removeEnumValue(index) {
    if (currentEnum.values) {
        currentEnum.values.splice(index, 1);
        renderEnumValuesList();
        updateEnumPreviewButtonVisibility();
    }
}

async function saveEnum() {
    // 收集基本信息
    const nameInput = document.getElementById('enum-name-input');
    const descInput = document.getElementById('enum-desc-input');
    const namespaceInput = document.getElementById('enum-namespace-input');
    const typeSelect = document.getElementById('enum-type-select');
    
    if (!nameInput || !descInput || !namespaceInput || !typeSelect) {
        showWarning('无法获取表单元素');
        return;
    }
    
    const name = nameInput.value.trim();
    const description = descInput.value.trim();
    const namespace = namespaceInput.value.trim();
    const type = typeSelect.value;

    // 验证
    if (!name) {
        showWarning('请输入枚举名称');
        return;
    }

    if (!currentEnum.values || currentEnum.values.length === 0) {
        showWarning('请至少添加一个枚举值');
        return;
    }

    // 验证枚举值
    for (let i = 0; i < currentEnum.values.length; i++) {
        const value = currentEnum.values[i];
        if (!value.key) {
            showWarning(`第 ${i + 1} 个枚举值的键名不能为空`);
            return;
        }
    }

    // 构造枚举数据
    const enumData = {
        name,
        description,
        namespace,
        type,
        values: currentEnum.values
    };

    try {
        const action = currentEnumName ? 'update' : 'create';
        const response = await fetch(API.ENUM, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action,
                name,
                data: enumData,
                project: currentProject
            })
        });

        const result = await response.json();

        if (result.success) {
            showSuccess(action === 'create' ? '枚举创建成功' : '枚举保存成功');
            currentEnumName = name;
            currentEnum.name = name;
            currentEnum.description = description;
            currentEnum.namespace = namespace;
            currentEnum.type = type;
            
            await loadEnums();
            
            // 重新选中当前枚举
            await editEnum(name);
        } else {
            showError('保存失败: ' + result.error);
        }
    } catch (error) {
        console.error('保存枚举失败:', error);
        showError('保存枚举失败，请检查网络连接');
    }
}

function cancelEnumEdit() {
    currentEnum = null;
    currentEnumName = '';
    isEditingEnum = false;
    document.getElementById('enum-editor').style.display = 'none';
    renderEnumFilesList();
}

// 显示枚举右键菜单
function showEnumContextMenu(x, y, enumName) {
    // 移除已存在的菜单
    const existing = document.querySelector('.context-menu');
    if (existing) {
        existing.remove();
    }

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    menu.innerHTML = `
        <div class="context-menu-item" onclick="editEnum('${enumName}'); closeContextMenu()">
            <i class="fas fa-edit"></i>
            <span>编辑</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" onclick="confirmDeleteEnum('${enumName}'); closeContextMenu()">
            <i class="fas fa-trash"></i>
            <span>删除</span>
        </div>
    `;

    document.body.appendChild(menu);

    // 点击其他地方关闭菜单
    setTimeout(() => {
        document.addEventListener('click', closeContextMenu);
    }, 0);
}

function closeContextMenu() {
    const menu = document.querySelector('.context-menu');
    if (menu) {
        menu.remove();
    }
    document.removeEventListener('click', closeContextMenu);
}

function confirmDeleteEnum(name) {
    showModal(`确定要删除枚举 "${name}" 吗？`, () => deleteEnum(name));
}

async function deleteEnum(name) {
    try {
        const response = await fetch(API.ENUM, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'delete',
                name,
                project: currentProject
            })
        });

        const result = await response.json();

        if (result.success) {
            showSuccess('枚举删除成功');
            if (currentEnumName === name) {
                cancelEnumEdit();
            }
            await loadEnums();
        } else {
            showError('删除失败: ' + result.error);
        }
    } catch (error) {
        console.error('删除枚举失败:', error);
        showError('删除枚举失败，请检查网络连接');
    }
}

function exportEnumToLua() {
    if (!currentEnum) return;

    const namespace = currentEnum.namespace || 'Enum';
    const enumName = currentEnum.name;
    const enumType = currentEnum.type || 'number';
    
    let luaCode = `---@namespace ${namespace}\n`;
    luaCode += `---@enum ${enumType === 'event' ? 'Event' : enumName}\n`;
    luaCode += `local ${enumName} = {\n`;
    
    currentEnum.values.forEach((value, index) => {
        const isLast = index === currentEnum.values.length - 1;
        const comma = isLast ? '' : ',';
        
        let valueStr;
        if (enumType === 'string' || enumType === 'event') {
            valueStr = `"${value.value}"`;
        } else if (enumType === 'flag') {
            valueStr = `1 << ${value.value}`;
        } else {
            valueStr = value.value;
        }
        
        if (enumType === 'event') {
            // 事件类型的注释格式
            luaCode += `    ${value.key} = ${valueStr}${comma} --[[\n`;
            if (value.label) {
                luaCode += `    ${value.label}\n`;
            }
            
            // 注册参数
            if (value.registerParams && value.registerParams.length > 0) {
                luaCode += `    注册参数：\n`;
                value.registerParams.forEach(param => {
                    const desc = param.description ? ` ${param.description}` : '';
                    luaCode += `    - ${param.name}: ${param.type}${desc}\n`;
                });
            }
            
            // 回调参数（事件数据）
            if (value.callbackParams && value.callbackParams.length > 0) {
                luaCode += `    事件数据：\n`;
                value.callbackParams.forEach(param => {
                    const desc = param.description ? ` ${param.description}` : '';
                    luaCode += `    - ${param.name}: ${param.type}${desc}\n`;
                });
            }
            
            luaCode += `    ]]\n`;
        } else {
            // 普通枚举的注释格式
            const comment = value.label ? ` --${value.label}` : '';
            luaCode += `    ${value.key} = ${valueStr}${comma}${comment}\n`;
        }
    });
    
    luaCode += `}\n\n`;
    luaCode += `return ${enumName}\n`;

    // 显示模态框
    document.getElementById('enum-lua-code-output').textContent = luaCode;
    document.getElementById('enum-export-lua-modal').classList.add('show');
}

function closeEnumExportModal() {
    document.getElementById('enum-export-lua-modal').classList.remove('show');
}

async function copyEnumLuaCode() {
    const codeElement = document.getElementById('enum-lua-code-output');
    const code = codeElement.textContent;
    
    try {
        await navigator.clipboard.writeText(code);
        
        // 显示复制成功提示
        const btn = document.getElementById('copy-enum-lua-btn');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> 已复制';
        btn.disabled = true;
        
        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }, 2000);
    } catch (error) {
        console.error('复制失败:', error);
        
        // 降级方案
        const textArea = document.createElement('textarea');
        textArea.value = code;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        
        try {
            document.execCommand('copy');
            alert('代码已复制到剪贴板');
        } catch (err) {
            alert('复制失败，请手动复制代码');
        }
        
        document.body.removeChild(textArea);
    }
}

function downloadEnumLuaFile() {
    const codeElement = document.getElementById('enum-lua-code-output');
    const code = codeElement.textContent;
    const fileName = currentEnum ? currentEnum.name : 'enum';
    
    // 创建Blob并下载
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}.lua`;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // 释放URL对象
    setTimeout(() => URL.revokeObjectURL(url), 100);
    
    // 显示下载成功提示
    const btn = document.getElementById('download-enum-btn');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> 已下载';
    btn.disabled = true;
    
    setTimeout(() => {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }, 2000);
}

// 枚举类型改变时的处理
function onEnumTypeChange() {
    if (currentEnum) {
        currentEnum.type = document.getElementById('enum-type-select').value;
        updateEnumPreviewButtonVisibility();
    }
}

// 更新预览按钮的可见性
function updateEnumPreviewButtonVisibility() {
    const previewBtn = document.getElementById('preview-enum-btn');
    if (!previewBtn) return;
    
    if (currentEnum && currentEnum.values && currentEnum.values.length > 0) {
        // 事件类型和标志类型都显示预览按钮
        if (currentEnum.type === 'flag' || currentEnum.type === 'event') {
            previewBtn.style.display = 'inline-block';
        } else {
            previewBtn.style.display = 'none';
        }
    } else {
        previewBtn.style.display = 'none';
    }
}

// 预览枚举值（标志类型显示二进制）
function previewEnumValues() {
    if (!currentEnum || !currentEnum.values) return;

    const content = document.getElementById('enum-preview-content');
    content.innerHTML = '';

    if (currentEnum.type === 'flag') {
        // 标志类型：显示二进制表示
        currentEnum.values.forEach(value => {
            const bitValue = 1 << parseInt(value.value);
            const binary = bitValue.toString(2).padStart(32, '0');
            
            const item = document.createElement('div');
            item.className = 'enum-preview-item';
            
            const keyDiv = document.createElement('div');
            keyDiv.className = 'enum-preview-key';
            keyDiv.textContent = value.key;
            
            const valueDiv = document.createElement('div');
            valueDiv.className = 'enum-preview-value';
            valueDiv.textContent = `1 << ${value.value}`;
            
            const binaryDiv = document.createElement('div');
            binaryDiv.className = 'enum-preview-binary';
            
            // 只显示最后16位
            const binaryStr = binary.slice(-16);
            for (let i = 0; i < binaryStr.length; i++) {
                const bit = document.createElement('span');
                bit.className = binaryStr[i] === '1' ? 'bit-1' : 'bit-0';
                bit.textContent = binaryStr[i];
                binaryDiv.appendChild(bit);
            }
            
            item.appendChild(keyDiv);
            item.appendChild(valueDiv);
            item.appendChild(binaryDiv);
            
            if (value.label) {
                const labelDiv = document.createElement('div');
                labelDiv.className = 'enum-preview-label';
                labelDiv.textContent = value.label;
                item.appendChild(labelDiv);
            }
            
            content.appendChild(item);
        });
    } else if (currentEnum.type === 'event') {
        // 事件类型：显示事件详细信息
        currentEnum.values.forEach(value => {
            const item = document.createElement('div');
            item.className = 'event-preview-card';
            item.style.cssText = `
                background: white;
                border: 1px solid #dee2e6;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 16px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            `;
            
            // 头部：事件名和值
            const headerDiv = document.createElement('div');
            headerDiv.style.cssText = `
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 12px;
                padding-bottom: 12px;
                border-bottom: 2px solid #e9ecef;
            `;
            
            const keyDiv = document.createElement('div');
            keyDiv.style.cssText = `
                font-size: 16px;
                font-weight: 700;
                color: #2c3e50;
            `;
            keyDiv.textContent = value.key;
            
            const valueDiv = document.createElement('div');
            valueDiv.style.cssText = `
                font-family: 'Courier New', monospace;
                color: #e74c3c;
                background: #fef5f5;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 13px;
            `;
            valueDiv.textContent = `"${value.value}"`;
            
            headerDiv.appendChild(keyDiv);
            headerDiv.appendChild(valueDiv);
            item.appendChild(headerDiv);
            
            // 事件说明
            if (value.label) {
                const labelDiv = document.createElement('div');
                labelDiv.style.cssText = `
                    color: #555;
                    font-size: 14px;
                    line-height: 1.6;
                    margin-bottom: 12px;
                    padding: 8px;
                    background: #f8f9fa;
                    border-left: 3px solid #3498db;
                    border-radius: 4px;
                `;
                labelDiv.textContent = value.label;
                item.appendChild(labelDiv);
            }
            
            // 参数区域容器
            const paramsContainer = document.createElement('div');
            paramsContainer.style.cssText = `
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
            `;
            
            // 注册参数
            if (value.registerParams && value.registerParams.length > 0) {
                const registerSection = document.createElement('div');
                registerSection.style.cssText = `
                    background: #fff9f0;
                    padding: 10px;
                    border-radius: 6px;
                    border: 1px solid #ffe8b3;
                `;
                
                const registerTitle = document.createElement('div');
                registerTitle.style.cssText = `
                    font-weight: 600;
                    color: #e67e22;
                    margin-bottom: 8px;
                    font-size: 13px;
                `;
                registerTitle.innerHTML = '<i class="fas fa-sign-in-alt"></i> 注册参数';
                registerSection.appendChild(registerTitle);
                
                value.registerParams.forEach(param => {
                    const paramDiv = document.createElement('div');
                    paramDiv.style.cssText = `
                        font-size: 12px;
                        padding: 4px 0;
                        color: #333;
                    `;
                    
                    const paramName = document.createElement('span');
                    paramName.style.cssText = 'font-weight: 600; color: #d68910;';
                    paramName.textContent = param.name;
                    
                    const paramType = document.createElement('span');
                    paramType.style.cssText = 'color: #16a085; margin-left: 4px;';
                    paramType.textContent = param.type;
                    
                    paramDiv.appendChild(paramName);
                    paramDiv.appendChild(document.createTextNode(': '));
                    paramDiv.appendChild(paramType);
                    
                    if (param.description) {
                        const paramDesc = document.createElement('span');
                        paramDesc.style.cssText = 'color: #7f8c8d; margin-left: 4px; font-style: italic;';
                        paramDesc.textContent = param.description;
                        paramDiv.appendChild(paramDesc);
                    }
                    
                    registerSection.appendChild(paramDiv);
                });
                
                paramsContainer.appendChild(registerSection);
            }
            
            // 回调参数
            if (value.callbackParams && value.callbackParams.length > 0) {
                const callbackSection = document.createElement('div');
                callbackSection.style.cssText = `
                    background: #f0f9ff;
                    padding: 10px;
                    border-radius: 6px;
                    border: 1px solid #b3d9ff;
                `;
                
                const callbackTitle = document.createElement('div');
                callbackTitle.style.cssText = `
                    font-weight: 600;
                    color: #2980b9;
                    margin-bottom: 8px;
                    font-size: 13px;
                `;
                callbackTitle.innerHTML = '<i class="fas fa-arrow-right"></i> 事件数据';
                callbackSection.appendChild(callbackTitle);
                
                value.callbackParams.forEach(param => {
                    const paramDiv = document.createElement('div');
                    paramDiv.style.cssText = `
                        font-size: 12px;
                        padding: 4px 0;
                        color: #333;
                    `;
                    
                    const paramName = document.createElement('span');
                    paramName.style.cssText = 'font-weight: 600; color: #2471a3;';
                    paramName.textContent = param.name;
                    
                    const paramType = document.createElement('span');
                    paramType.style.cssText = 'color: #16a085; margin-left: 4px;';
                    paramType.textContent = param.type;
                    
                    paramDiv.appendChild(paramName);
                    paramDiv.appendChild(document.createTextNode(': '));
                    paramDiv.appendChild(paramType);
                    
                    if (param.description) {
                        const paramDesc = document.createElement('span');
                        paramDesc.style.cssText = 'color: #7f8c8d; margin-left: 4px; font-style: italic;';
                        paramDesc.textContent = param.description;
                        paramDiv.appendChild(paramDesc);
                    }
                    
                    callbackSection.appendChild(paramDiv);
                });
                
                paramsContainer.appendChild(callbackSection);
            }
            
            if (paramsContainer.children.length > 0) {
                item.appendChild(paramsContainer);
            }
            
            content.appendChild(item);
        });
    } else {
        // 其他类型：简单列表
        currentEnum.values.forEach(value => {
            const item = document.createElement('div');
            item.className = 'enum-preview-item';
            
            const keyDiv = document.createElement('div');
            keyDiv.className = 'enum-preview-key';
            keyDiv.textContent = value.key;
            
            const valueDiv = document.createElement('div');
            valueDiv.className = 'enum-preview-value';
            if (currentEnum.type === 'string') {
                valueDiv.textContent = `"${value.value}"`;
            } else {
                valueDiv.textContent = value.value;
            }
            
            item.appendChild(keyDiv);
            item.appendChild(valueDiv);
            
            if (value.label) {
                const labelDiv = document.createElement('div');
                labelDiv.className = 'enum-preview-label';
                labelDiv.textContent = value.label;
                item.appendChild(labelDiv);
            }
            
            content.appendChild(item);
        });
    }

    document.getElementById('enum-preview-modal').classList.add('show');
}

function closeEnumPreviewModal() {
    document.getElementById('enum-preview-modal').classList.remove('show');
}

// 显示填充枚举对话框
async function showFillFromEnumDialog() {
    if (!currentSchemaName) {
        alert('请先选择一个配表');
        return;
    }

    // 加载枚举列表
    try {
        const response = await fetch(getApiUrl(API.ENUM, { action: 'list' }));
        const result = await response.json();

        if (result.success) {
            const select = document.getElementById('fill-enum-select');
            select.innerHTML = '<option value="">请选择枚举</option>';
            
            result.data.forEach(enumData => {
                const option = document.createElement('option');
                option.value = enumData.name;
                option.textContent = `${enumData.name} (${enumData.description || '无描述'})`;
                select.appendChild(option);
            });

            document.getElementById('fill-enum-modal').classList.add('show');
        } else {
            alert('加载枚举列表失败: ' + result.error);
        }
    } catch (error) {
        console.error('加载枚举列表失败:', error);
        alert('加载枚举列表失败，请检查网络连接');
    }
}

function closeFillEnumModal() {
    document.getElementById('fill-enum-modal').classList.remove('show');
}

// 确认从枚举填充数据
async function confirmFillFromEnum() {
    const enumName = document.getElementById('fill-enum-select').value;
    if (!enumName) {
        alert('请选择一个枚举');
        return;
    }

    try {
        // 获取枚举数据
        const response = await fetch(getApiUrl(API.ENUM, { action: 'get', name: enumName }));
        const result = await response.json();

        if (!result.success) {
            alert('获取枚举数据失败: ' + result.error);
            return;
        }

        const enumData = result.data;
        if (!enumData.values || enumData.values.length === 0) {
            alert('该枚举没有任何值');
            return;
        }

        // 获取填充选项
        const fillMode = document.getElementById('fill-enum-mode').value;
        const withPrefix = document.getElementById('fill-enum-with-prefix').checked;
        const asRaw = document.getElementById('fill-enum-as-raw').checked;
        
        // 获取已存在的数据行名称集合
        const existingNames = new Set(dataRows.map(row => row.name));
        
        // 只添加不存在的枚举项
        let addedCount = 0;
        enumData.values.forEach(enumValue => {
            // 根据填充模式和选项生成数据行名称
            let rowName;
            const enumValue_str = fillMode === 'key' ? enumValue.key : enumValue.value;
            
            if (withPrefix) {
                // 带前缀：EnumName.Value
                rowName = `${enumData.name}.${enumValue_str}`;
            } else {
                // 不带前缀：Value
                rowName = String(enumValue_str);
            }
            
            // 如果数据行已存在，跳过
            if (existingNames.has(rowName)) {
                return;
            }
            
            
            const newRowData = {};
            
            // 根据schema初始化字段
            if (currentSchema && currentSchema.fields) {
                currentSchema.fields.forEach(field => {
                    const key = normalizeFieldKey(field.name);
                    if (field.type === 'entry') {
                        newRowData[key] = [];
                    } else {
                        newRowData[key] = getTypedDefaultValue(field.type);
                    }
                });
            }
            
            const newRow = {
                name: rowName,
                data: newRowData
            };
            
            // 如果选择了原始文本，标记name字段
            if (asRaw) {
                newRow.isRaw = true;
            }
            
            dataRows.push(newRow);
            addedCount++;
        });

        // 刷新数据行列表
        renderDataRowsList();
        
        // 如果有新增的数据行，选中第一个新增的
        if (addedCount > 0) {
            const firstNewIndex = dataRows.length - addedCount;
            selectedDataRowIndex = firstNewIndex;
            renderDataRowEditor(firstNewIndex);
        }

        closeFillEnumModal();
        
        if (addedCount > 0) {
            alert(`成功从枚举 "${enumName}" 添加了 ${addedCount} 个新数据行`);
        } else {
            alert(`枚举 "${enumName}" 的所有项都已存在，无需添加`);
        }
    } catch (error) {
        console.error('填充枚举失败:', error);
        alert('填充枚举失败，请检查网络连接');
    }
}

// ========== 枚举导入功能 ==========

function openEnumImportModal() {
    document.getElementById('enum-import-modal').classList.add('show');
    document.getElementById('enum-import-text').value = '';
    document.getElementById('enum-import-file').value = '';
    document.getElementById('import-enum-name').value = '';
    document.getElementById('import-file-preview').style.display = 'none';
    switchImportTab('text');
}

function closeEnumImportModal() {
    document.getElementById('enum-import-modal').classList.remove('show');
}

function switchImportTab(tabName) {
    // 更新tab按钮状态
    document.querySelectorAll('.import-tab').forEach(btn => {
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // 显示对应内容
    document.getElementById('import-text-tab').style.display = tabName === 'text' ? 'block' : 'none';
    document.getElementById('import-file-tab').style.display = tabName === 'file' ? 'block' : 'none';
}

// 解析Lua枚举代码
function parseLuaEnumCode(code) {
    const result = {
        name: '',
        namespace: 'Enum',
        type: 'number',
        description: '',
        values: []
    };
    
    // 尝试解析 local EnumName = { 或 EnumName = {
    const nameMatch = code.match(/(?:local\s+)?(\w+)\s*=\s*\{/);
    if (nameMatch) {
        result.name = nameMatch[1];
    }
    
    // 尝试解析 ---@namespace
    const namespaceMatch = code.match(/---@namespace\s+(\w+)/);
    if (namespaceMatch) {
        result.namespace = namespaceMatch[1];
    }
    
    // 尝试解析 ---@enum 类型
    const enumTypeMatch = code.match(/---@enum\s+(\w+)/);
    if (enumTypeMatch) {
        const enumTypeStr = enumTypeMatch[1];
        if (enumTypeStr === 'Event') {
            result.type = 'event';
        }
    }
    
    // 检查是否是事件枚举（通过检测 --[[ 多行注释格式）
    const isEventEnum = result.type === 'event' || code.includes('--[[') && (code.includes('注册参数：') || code.includes('事件数据：'));
    
    if (isEventEnum) {
        result.type = 'event';
        // 解析事件枚举
        parseEventEnumValues(code, result);
    } else {
        // 解析普通枚举值
        parseNormalEnumValues(code, result);
    }
    
    return result;
}

/**
 * 解析事件枚举值
 */
function parseEventEnumValues(code, result) {
    // 匹配事件枚举项：Key = "value", --[[ ... ]]
    const eventPattern = /(\w+)\s*=\s*"([^"]+)"(?:,?)\s*--\[\[([\s\S]*?)\]\]/g;
    
    const bracketMatch = code.match(/\{([\s\S]*?)\}\s*(?:return|$)/);
    if (!bracketMatch) return;
    
    const content = bracketMatch[1];
    let match;
    
    while ((match = eventPattern.exec(content)) !== null) {
        const key = match[1].trim();
        const value = match[2].trim();
        const commentBlock = match[3];
        
        const eventValue = {
            key: key,
            value: value,
            label: '',
            registerParams: [],
            callbackParams: []
        };
        
        // 解析注释块
        const lines = commentBlock.split('\n').map(l => l.trim()).filter(l => l);
        
        let currentSection = 'label'; // 'label', 'register', 'callback'
        
        for (const line of lines) {
            if (line === '注册参数：') {
                currentSection = 'register';
                continue;
            } else if (line === '事件数据：') {
                currentSection = 'callback';
                continue;
            }
            
            if (line.startsWith('- ')) {
                // 解析参数：- name: type description
                // 类型可能包含 <> 如 Array<Tile.MutationPoolEntry>
                const paramMatch = line.match(/^-\s*(\w+):\s*(\S+)\s*(.*)?$/);
                if (paramMatch) {
                    const param = {
                        name: paramMatch[1],
                        type: paramMatch[2],
                        description: paramMatch[3] || ''
                    };
                    
                    if (currentSection === 'register') {
                        eventValue.registerParams.push(param);
                    } else if (currentSection === 'callback') {
                        eventValue.callbackParams.push(param);
                    }
                }
            } else if (currentSection === 'label' && line) {
                // 第一行非参数内容作为标签
                eventValue.label = line;
            }
        }
        
        result.values.push(eventValue);
    }
}

/**
 * 解析普通枚举值（number/string/flag）
 */
function parseNormalEnumValues(code, result) {
    // 解析枚举值 - 支持多种格式
    // 格式1: Key = 1, --注释
    // 格式2: Key = "string", --注释
    // 格式3: Key = 1 << 0, --注释 (flag)
    const valuePattern = /(\w+)\s*=\s*([^,\n]+?)(?:,?\s*--(.*))?$/gm;
    let hasFlag = false;
    let hasString = false;
    
    const bracketMatch = code.match(/\{([\s\S]*?)\}/);
    if (bracketMatch) {
        const content = bracketMatch[1];
        let match;
        
        while ((match = valuePattern.exec(content)) !== null) {
            const key = match[1].trim();
            let valueStr = match[2].trim();
            const comment = match[3] ? match[3].trim() : '';
            
            // 移除尾部逗号
            valueStr = valueStr.replace(/,\s*$/, '');
            
            // 跳过多行注释开头（事件枚举会被误匹配）
            if (valueStr.includes('--[[')) continue;
            
            // 判断值类型
            let value;
            if (valueStr.includes('<<')) {
                // flag 类型
                hasFlag = true;
                const flagMatch = valueStr.match(/\d+\s*<<\s*(\d+)/);
                if (flagMatch) {
                    value = parseInt(flagMatch[1]);
                } else {
                    value = 0;
                }
            } else if (valueStr.startsWith('"') || valueStr.startsWith("'")) {
                // 字符串类型
                hasString = true;
                value = valueStr.replace(/^["']|["']$/g, '');
            } else {
                // 数字类型
                value = parseInt(valueStr) || 0;
            }
            
            result.values.push({
                key: key,
                value: value,
                label: comment
            });
        }
    }
    
    // 根据值类型判断枚举类型
    if (hasFlag) {
        result.type = 'flag';
    } else if (hasString) {
        result.type = 'string';
    }
}

async function confirmEnumImport() {
    let code = '';
    
    // 获取代码
    const activeTab = document.querySelector('.import-tab.active');
    if (activeTab && activeTab.dataset.tab === 'file') {
        code = document.getElementById('import-file-content').textContent;
    } else {
        code = document.getElementById('enum-import-text').value;
    }
    
    if (!code.trim()) {
        showWarning('请输入或选择要导入的枚举代码');
        return;
    }
    
    // 解析代码
    const parsed = parseLuaEnumCode(code);
    
    // 检查是否有自定义名称
    const customName = document.getElementById('import-enum-name').value.trim();
    if (customName) {
        parsed.name = customName;
    }
    
    if (!parsed.name) {
        showWarning('无法解析枚举名称，请手动输入');
        return;
    }
    
    if (parsed.values.length === 0) {
        showWarning('无法解析枚举值，请检查代码格式');
        return;
    }
    
    // 检查是否已存在同名枚举
    const existingEnum = enums.find(e => e.name === parsed.name);
    if (existingEnum) {
        if (!confirm(`枚举 "${parsed.name}" 已存在，是否覆盖？`)) {
            return;
        }
    }
    
    // 设置当前枚举并进入编辑状态
    currentEnum = parsed;
    currentEnumName = existingEnum ? parsed.name : '';
    isEditingEnum = true;
    
    // 显示编辑器
    document.getElementById('enum-editor').style.display = 'flex';
    document.getElementById('enum-editor-title').textContent = existingEnum ? `编辑枚举: ${parsed.name}` : '新建枚举 (从导入)';
    document.getElementById('export-enum-lua-btn').style.display = existingEnum ? 'inline-block' : 'none';
    
    updateEnumPreviewButtonVisibility();
    renderEnumContentEditor();
    renderEnumFilesList();
    
    closeEnumImportModal();
    showSuccess(`成功导入枚举 "${parsed.name}"，包含 ${parsed.values.length} 个值`);
}

// 文件选择事件处理
document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('enum-import-file');
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    const content = event.target.result;
                    document.getElementById('import-file-content').textContent = content;
                    document.getElementById('import-file-preview').style.display = 'block';
                };
                reader.readAsText(file);
            }
        });
    }
    
    // 绑定导入按钮事件
    const importBtn = document.getElementById('import-enum-btn');
    if (importBtn) {
        importBtn.addEventListener('click', openEnumImportModal);
    }
});
