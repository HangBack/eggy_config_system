async function loadSchemaSelectOptions() {
    const inputElement = document.getElementById('data-schema-select');
    const dropdownElement = document.getElementById('data-schema-select-dropdown');
    
    try {
        const response = await fetch(`${API.SCHEMA}?action=list`);
        const result = await response.json();
        
        if (result.success) {
            schemas = result.data || [];
            
            // 格式化为 datalist 选项格式
            const options = schemas.map(schema => ({
                value: schema.name,
                label: schema.description || ''
            }));
            
            // 初始化自定义 datalist
            initCustomDatalist(inputElement, dropdownElement, options);
            
            // 监听选择事件
            inputElement.removeEventListener('change', loadDataForSchema);
            inputElement.addEventListener('change', loadDataForSchema);
        }
    } catch (error) {
        console.error('加载Schema选项错误:', error);
    }
}

async function loadDataForSchema() {
    const schemaName = document.getElementById('data-schema-select').value.trim();
    
    if (!schemaName) {
        document.getElementById('data-editor').style.display = 'none';
        return;
    }

    // 验证 schema 名称是否存在于列表中（静默处理，不显示警告）
    const schemaExists = schemas.some(s => s.name === schemaName);
    if (!schemaExists) {
        // 静默忽略无效输入，不做任何提示
        document.getElementById('data-editor').style.display = 'none';
        // 清空输入框，避免显示无效的名称
        document.getElementById('data-schema-select').value = '';
        return;
    }

    // 在切换 schema 前，保存当前编辑的数据（如果有的话）
    if (currentSchema && selectedDataRowIndex >= 0) {
        saveCurrentEditToMemory();
    }

    try {
        // 加载Schema定义
        const schemaResponse = await fetch(`${API.SCHEMA}?action=get&name=${encodeURIComponent(schemaName)}`);
        const schemaResult = await schemaResponse.json();
        
        if (!schemaResult.success) {
            console.error(`加载Schema失败: ${schemaName}`, schemaResult.error);
            // 不显示 alert，只在控制台记录错误
            document.getElementById('data-editor').style.display = 'none';
            return;
        }

        currentSchema = schemaResult.data;
        currentSchemaName = schemaName;

        // 加载数据
        const dataResponse = await fetch(`${API.DATA}?action=get&name=${encodeURIComponent(schemaName)}`);
        const dataResult = await dataResponse.json();
        
        dataRows = [];
        if (dataResult.success) {
            const loadedData = dataResult.data || [];
            dataRows = loadedData.map((row, index) => {
                // 兼容新旧格式：新格式有 name 和 data 字段，旧格式直接是数据
                if (row.name !== undefined && row.data !== undefined) {
                    // 新格式
                    return {
                        name: row.name,
                        isRaw: row.isRaw || false,
                        data: row.data
                    };
                } else {
                    // 旧格式（向后兼容）
                    return {
                        name: `数据行 ${index + 1}`,
                        isRaw: false,
                        data: row
                    };
                }
            });
        }

        selectedDataRowIndex = -1;
        
        // 清空搜索框
        const searchInput = document.getElementById('data-rows-search');
        if (searchInput) {
            searchInput.value = '';
        }
        
        renderDataRowsList();
        document.getElementById('data-row-editor-container').innerHTML = 
            '<div class="empty-state"><i class="fas fa-hand-pointer"></i><p>请从左侧选择或添加数据行</p></div>';
        document.getElementById('data-editor').style.display = 'block';
        document.getElementById('data-table-title').textContent = `${schemaName} - 配表数据`;
        document.getElementById('import-data-btn').style.display = 'inline-flex';
        document.getElementById('preview-data-btn').style.display = 'inline-flex';
        document.getElementById('export-lua-btn').style.display = 'inline-flex';
    } catch (error) {
        console.error('加载数据错误:', error);
        alert('加载数据失败');
    }
}

function renderDataRowsList() {
    const container = document.getElementById('data-rows-list');
    container.innerHTML = '';

    // 获取搜索关键词
    const searchInput = document.getElementById('data-rows-search');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

    // 过滤数据行
    const filteredRows = dataRows.filter((dataRow, index) => {
        if (!searchTerm) return true;
        return dataRow.name.toLowerCase().includes(searchTerm);
    });

    // 渲染过滤后的数据行
    filteredRows.forEach((dataRow) => {
        const index = dataRows.indexOf(dataRow);
        const item = createDataRowListItem(dataRow, index);
        container.appendChild(item);
    });

    if (filteredRows.length === 0) {
        if (searchTerm) {
            container.innerHTML = '<p style="color: #95a5a6; text-align: center; padding: 20px;">未找到匹配的数据</p>';
        } else {
            container.innerHTML = '<p style="color: #95a5a6; text-align: center; padding: 20px;">暂无数据</p>';
        }
    }
}

function createDataRowListItem(dataRow, index) {
    const div = document.createElement('div');
    div.className = 'data-row-list-item';
    if (index === selectedDataRowIndex) {
        div.classList.add('active');
    }
    
    div.innerHTML = `
        <div class="data-row-list-item-name">${escapeHtml(dataRow.name)}</div>
        <div class="data-row-list-item-actions">
            <button type="button" class="btn btn-sm btn-danger" onclick="event.stopPropagation(); removeDataRow(${index})">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
    
    div.addEventListener('click', () => {
        // 在切换前保存当前编辑的数据到内存
        saveCurrentEditToMemory();
        
        selectedDataRowIndex = index;
        renderDataRowsList();
        renderDataRowEditor(index);
    });
    
    return div;
}

function updateDataRowName(index, newName) {
    dataRows[index].name = newName;
}

// 将当前编辑器中的数据保存到内存中的 dataRows
function saveCurrentEditToMemory() {
    if (selectedDataRowIndex < 0 || selectedDataRowIndex >= dataRows.length) {
        return; // 没有选中的数据行
    }
    
    // 如果 currentSchema 为空，则无法保存
    if (!currentSchema) {
        return;
    }
    
    const fields = currentSchema.fields || [];
    const currentData = {};
    
    fields.forEach(field => {
        if (field.type === 'dict') {
            const selector = `.dict-container[data-row="${selectedDataRowIndex}"][data-field="${field.name}"]`;
            const container = document.querySelector(selector);
            if (container) {
                currentData[field.name] = collectDictDataFromContainer(container, field);
            } else {
                // 如果容器不存在，保持原有数据
                currentData[field.name] = getFieldValue(dataRows[selectedDataRowIndex].data, field.name) || {};
            }
        } else if (field.type === 'entry' || field.type === 'list') {
            const selector = field.type === 'entry' ?
                `.entry-container[data-row="${selectedDataRowIndex}"][data-field="${field.name}"]` :
                `.list-container[data-row="${selectedDataRowIndex}"][data-field="${field.name}"]`;
            const container = document.querySelector(selector);
            if (container) {
                currentData[field.name] = field.type === 'entry' ? collectEntryDataFromContainer(container, field) : collectListDataFromContainer(container, field);
            } else {
                // 如果容器不存在，保持原有数据
                currentData[field.name] = getFieldValue(dataRows[selectedDataRowIndex].data, field.name) || [];
            }
        } else {
            const input = document.querySelector(`#field-${selectedDataRowIndex}-${field.name}`);
            if (input) {
                currentData[field.name] = input.value;
            } else {
                // 如果输入框不存在，保持原有数据
                currentData[field.name] = getFieldValue(dataRows[selectedDataRowIndex].data, field.name) || '';
            }
        }
    });
    
    // 更新内存中的数据
    dataRows[selectedDataRowIndex].data = currentData;
}

async function renderDataRowEditor(index) {
    const container = document.getElementById('data-row-editor-container');
    const dataRow = dataRows[index];
    
    // 如果 currentSchema 为空，显示错误信息
    if (!currentSchema) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Schema 未加载，请刷新或重新选择</p></div>';
        return;
    }
    
    container.innerHTML = '';
    
    const editor = document.createElement('div');
    editor.className = 'data-row-editor';
    editor.innerHTML = createDataRowEditorHTML(dataRow, index);
    container.appendChild(editor);
    
    // 绑定名称输入框事件
    const nameInput = document.getElementById(`data-row-name-input-${index}`);
    if (nameInput) {
        nameInput.addEventListener('input', () => {
            dataRows[index].name = nameInput.value;
            renderDataRowsList();
        });
    }
    
    // 绑定原始文本复选框事件
    const rawCheckbox = document.getElementById(`data-row-raw-${index}`);
    if (rawCheckbox) {
        rawCheckbox.addEventListener('change', () => {
            dataRows[index].isRaw = rawCheckbox.checked;
        });
    }
    
    // 异步加载关联字段的选项
    await loadLinkedFieldOptions(index);
}

function createDataRowEditorHTML(dataRow, rowIndex) {
    // 防御性检查
    if (!currentSchema) {
        return '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Schema Schema 未加载，请刷新或重新选择</p></div>';
    }
    
    const fields = currentSchema.fields || [];
    const fieldsHtml = fields.map(field => {
        // 使用工具函数获取字段值，支持数字键
        const value = getFieldValue(dataRow.data, field.name) ?? field.defaultValue ?? '';
        return createFieldInput(field, value, rowIndex);
    }).join('');

    return `
        <div class="data-row-editor-header">
            <div class="data-row-name-section">
                <label>
                    <input type="checkbox" id="data-row-raw-${rowIndex}" ${dataRow.isRaw ? 'checked' : ''}>
                    原始
                </label>
                <input type="text" id="data-row-name-input-${rowIndex}" class="data-row-name-input" 
                       value="${escapeHtml(dataRow.name)}" 
                       placeholder="数据行名称">
            </div>
        </div>
        <div class="data-row-fields">
            ${fieldsHtml}
        </div>
    `;
}

// 获取字段的选项列表（支持关联配表和枚举）
async function getFieldOptions(field) {
    // 如果是关联配表模式
    if (field.dataSource && field.dataSource.type === 'linked' && field.dataSource.schema) {
        const linkedSchemaName = field.dataSource.schema;
        try {
            const response = await fetch(`${API_BASE}/data?action=load&name=${encodeURIComponent(linkedSchemaName)}`);
            const result = await response.json();
            
            if (result.success && result.data) {
                // 将数据行名称作为选项返回
                return result.data.map(row => {
                    // 兼容新旧格式
                    if (typeof row === 'object' && row.name !== undefined) {
                        return row.name;
                    } else if (typeof row === 'object' && row.data) {
                        return Object.values(row.data)[0] || '';
                    }
                    return '';
                }).filter(opt => opt);
            }
        } catch (error) {
            console.error('加载关联配表数据失败:', error);
        }
    }
    
    // 如果是枚举模式
    if (field.dataSource && field.dataSource.type === 'enum' && field.dataSource.enum) {
        const enumName = field.dataSource.enum;
        const enumPrefix = field.dataSource.enumPrefix || '';
        try {
            const response = await fetch(`${API.ENUM}?action=get&name=${encodeURIComponent(enumName)}`);
            const result = await response.json();
            
            if (result.success && result.data && result.data.values) {
                // 返回枚举值（键名或value|label格式），带前缀
                if (field.type === 'datalist' || field.elementType === 'datalist') {
                    // datalist返回带标签的格式
                    return result.data.values.map(v => {
                        const valueWithPrefix = enumPrefix ? `${enumPrefix}.${v.key}` : v.key;
                        return {
                            value: valueWithPrefix,
                            label: v.label || ''
                        };
                    });
                } else {
                    // option返回键名，带前缀
                    return result.data.values.map(v => {
                        return enumPrefix ? `${enumPrefix}.${v.key}` : v.key;
                    });
                }
            }
        } catch (error) {
            console.error('加载枚举数据失败:', error);
        }
    }
    
    // 手动输入模式，直接返回选项
    return field.options || [];
}

// 初始化自定义 datalist 事件
function initCustomDatalist(inputElement, dropdownElement, options) {
    const wrapper = inputElement.closest('.custom-datalist-wrapper');
    if (!wrapper) return;
    
    let currentOptions = options;
    let activeIndex = -1;
    
    // 渲染选项列表
    function renderOptions(filteredOptions) {
        if (!filteredOptions || filteredOptions.length === 0) {
            dropdownElement.innerHTML = '<div class="custom-datalist-empty">无匹配项</div>';
            return;
        }
        
        const optionsHtml = filteredOptions.map((opt, index) => {
            let valueText, labelText;
            if (typeof opt === 'object') {
                valueText = opt.value;
                labelText = opt.label;
            } else {
                valueText = opt;
                labelText = '';
            }
            
            const isSelected = inputElement.value === valueText;
            return `
                <div class="custom-datalist-option ${isSelected ? 'selected' : ''}" data-index="${index}" data-value="${escapeHtml(valueText)}">
                    <span class="custom-datalist-option-value">${escapeHtml(valueText)}</span>
                    ${labelText ? `<span class="custom-datalist-option-label">${escapeHtml(labelText)}</span>` : ''}
                </div>
            `;
        }).join('');
        
        dropdownElement.innerHTML = optionsHtml;
    }
    
    // 过滤选项
    function filterOptions(searchText) {
        if (!searchText) return currentOptions;
        
        const search = searchText.toLowerCase();
        return currentOptions.filter(opt => {
            if (typeof opt === 'object') {
                return opt.value.toLowerCase().includes(search) || 
                       (opt.label && opt.label.toLowerCase().includes(search));
            }
            return opt.toLowerCase().includes(search);
        });
    }
    
    // 显示下拉列表
    function showDropdown() {
        const filtered = filterOptions(inputElement.value);
        renderOptions(filtered);
        dropdownElement.classList.add('show');
        activeIndex = -1;
    }
    
    // 隐藏下拉列表
    function hideDropdown() {
        dropdownElement.classList.remove('show');
        activeIndex = -1;
    }
    
    // 选择选项
    function selectOption(value) {
        inputElement.value = value;
        hideDropdown();
        // 同步触发事件，确保值立即更新
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    // 高亮活动选项
    function setActiveOption(index) {
        const options = dropdownElement.querySelectorAll('.custom-datalist-option');
        options.forEach(opt => opt.classList.remove('active'));
        
        if (index >= 0 && index < options.length) {
            options[index].classList.add('active');
            options[index].scrollIntoView({ block: 'nearest' });
            activeIndex = index;
        }
    }
    
    // 输入事件
    inputElement.addEventListener('focus', () => {
        showDropdown();
    });
    
    inputElement.addEventListener('input', () => {
        showDropdown();
    });
    
    // 键盘导航
    inputElement.addEventListener('keydown', (e) => {
        if (!dropdownElement.classList.contains('show')) return;
        
        const options = dropdownElement.querySelectorAll('.custom-datalist-option');
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveOption(Math.min(activeIndex + 1, options.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveOption(Math.max(activeIndex - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0 && activeIndex < options.length) {
                const value = options[activeIndex].getAttribute('data-value');
                selectOption(value);
            }
        } else if (e.key === 'Escape') {
            hideDropdown();
        }
    });
    
    // 点击选项
    dropdownElement.addEventListener('click', (e) => {
        const option = e.target.closest('.custom-datalist-option');
        if (option) {
            const value = option.getAttribute('data-value');
            selectOption(value);
        }
    });
    
    // 点击外部关闭
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            hideDropdown();
        }
    });
    
    // 初始渲染
    renderOptions(currentOptions);
}

// 加载所有关联字段的选项
async function loadLinkedFieldOptions(rowIndex) {
    if (!currentSchema) return;
    const fields = currentSchema.fields || [];
    
    for (const field of fields) {
        if (field.type === 'option' || field.type === 'datalist') {
            // 检查是否是关联配表或枚举模式
            if (field.dataSource && (field.dataSource.type === 'linked' || field.dataSource.type === 'enum')) {
                const options = await getFieldOptions(field);
                const currentValue = dataRows[rowIndex].data[field.name] || '';
                
                // 更新选项
                if (field.type === 'option') {
                    const selectElement = document.getElementById(`field-${rowIndex}-${field.name}`);
                    if (selectElement) {
                        const optionsHtml = options.map(opt => 
                            `<option value="${escapeHtml(opt)}" ${currentValue === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`
                        ).join('');
                        selectElement.innerHTML = `<option value="">-- 请选择 --</option>${optionsHtml}`;
                    }
                } else if (field.type === 'datalist') {
                    const inputElement = document.getElementById(`field-${rowIndex}-${field.name}`);
                    const dropdownElement = document.getElementById(`datalist-field-${rowIndex}-${field.name}`);
                    if (inputElement && dropdownElement) {
                        // 将简单字符串转换为对象格式（关联模式返回字符串，枚举模式已经是对象）
                        const formattedOptions = options.map(opt => 
                            typeof opt === 'string' ? { value: opt, label: '' } : opt
                        );
                        initCustomDatalist(inputElement, dropdownElement, formattedOptions);
                    }
                }
            } else {
                // 手动模式，直接使用 field.options
                const currentValue = dataRows[rowIndex].data[field.name] || '';
                const options = field.options || [];
                
                if (field.type === 'option') {
                    const selectElement = document.getElementById(`field-${rowIndex}-${field.name}`);
                    if (selectElement) {
                        const optionsHtml = options.map(opt => 
                            `<option value="${escapeHtml(opt)}" ${currentValue === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`
                        ).join('');
                        selectElement.innerHTML = `<option value="">-- 请选择 --</option>${optionsHtml}`;
                    }
                } else if (field.type === 'datalist') {
                    const inputElement = document.getElementById(`field-${rowIndex}-${field.name}`);
                    const dropdownElement = document.getElementById(`datalist-field-${rowIndex}-${field.name}`);
                    if (inputElement && dropdownElement) {
                        // 手动模式已经是正确的格式
                        const formattedOptions = options.map(opt => {
                            if (typeof opt === 'object') {
                                return opt;
                            }
                            return { value: opt, label: '' };
                        });
                        initCustomDatalist(inputElement, dropdownElement, formattedOptions);
                    }
                }
            }
        }
        
        // 处理字典类型的子字段
        if (field.type === 'dict' && field.subfields) {
            await loadLinkedDictSubfieldOptions(rowIndex, field);
        }
        
        // 处理条目类型的子字段
        if (field.type === 'entry' && field.subfields) {
            await loadLinkedSubfieldOptions(rowIndex, field);
        }
        
        // 处理列表类型的元素（如果元素类型为 option 或 datalist）
        if (field.type === 'list' && (field.elementType === 'option' || field.elementType === 'datalist')) {
            const items = dataRows[rowIndex].data[field.name] || [];
            for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
                const currentValue = items[itemIndex] || '';
                const itemId = `list-${rowIndex}-${field.name}-${itemIndex}`;

                // 检查是否是关联配表或枚举模式
                if (field.dataSource && (field.dataSource.type === 'linked' || field.dataSource.type === 'enum')) {
                    const options = await getFieldOptions(field);
                    if (field.elementType === 'option') {
                        const selectElement = document.getElementById(itemId);
                        if (selectElement) {
                            const optionsHtml = options.map(opt => 
                                `<option value="${escapeHtml(opt)}" ${currentValue === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`
                            ).join('');
                            selectElement.innerHTML = `<option value="">-- 请选择 --</option>${optionsHtml}`;
                        }
                    } else if (field.elementType === 'datalist') {
                        const inputElement = document.getElementById(itemId);
                        const dropdownElement = document.getElementById(`datalist-${itemId}`);
                        if (inputElement && dropdownElement) {
                            const formattedOptions = options.map(opt => typeof opt === 'string' ? { value: opt, label: '' } : opt);
                            initCustomDatalist(inputElement, dropdownElement, formattedOptions);
                        }
                    }
                } else {
                    // 手动模式，直接使用 field.options
                    const options = field.options || [];
                    if (field.elementType === 'option') {
                        const selectElement = document.getElementById(itemId);
                        if (selectElement) {
                            const optionsHtml = options.map(opt => 
                                `<option value="${escapeHtml(opt)}" ${currentValue === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`
                            ).join('');
                            selectElement.innerHTML = `<option value="">-- 请选择 --</option>${optionsHtml}`;
                        }
                    } else if (field.elementType === 'datalist') {
                        const inputElement = document.getElementById(itemId);
                        const dropdownElement = document.getElementById(`datalist-${itemId}`);
                        if (inputElement && dropdownElement) {
                            const formattedOptions = options.map(opt => typeof opt === 'object' ? opt : { value: opt, label: '' });
                            initCustomDatalist(inputElement, dropdownElement, formattedOptions);
                        }
                    }
                }
            }
        }
    }
}

// 加载字典子字段的关联选项
async function loadLinkedDictSubfieldOptions(rowIndex, field) {
    const dictData = dataRows[rowIndex].data[field.name] || {};
    
    for (const subfield of field.subfields) {
        if (subfield.type === 'option' || subfield.type === 'datalist') {
            const subfieldId = `dict-${rowIndex}-${field.name}-${subfield.name}`;
            const currentValue = dictData[subfield.name] || '';
            
            if (subfield.dataSource && (subfield.dataSource.type === 'linked' || subfield.dataSource.type === 'enum')) {
                const options = await getFieldOptions(subfield);
                if (subfield.type === 'option') {
                    const selectElement = document.getElementById(subfieldId);
                    if (selectElement) {
                        const optionsHtml = options.map(opt => 
                            `<option value="${escapeHtml(opt)}" ${currentValue === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`
                        ).join('');
                        selectElement.innerHTML = `<option value="">-- 请选择 --</option>${optionsHtml}`;
                    }
                } else if (subfield.type === 'datalist') {
                    const inputElement = document.getElementById(subfieldId);
                    const dropdownElement = document.getElementById(`datalist-${subfieldId}`);
                    if (inputElement && dropdownElement) {
                        const formattedOptions = options.map(opt => typeof opt === 'string' ? { value: opt, label: '' } : opt);
                        initCustomDatalist(inputElement, dropdownElement, formattedOptions);
                    }
                }
            } else {
                // 手动模式
                const options = subfield.options || [];
                if (subfield.type === 'option') {
                    const selectElement = document.getElementById(subfieldId);
                    if (selectElement) {
                        const optionsHtml = options.map(opt => 
                            `<option value="${escapeHtml(opt)}" ${currentValue === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`
                        ).join('');
                        selectElement.innerHTML = `<option value="">-- 请选择 --</option>${optionsHtml}`;
                    }
                } else if (subfield.type === 'datalist') {
                    const inputElement = document.getElementById(subfieldId);
                    const dropdownElement = document.getElementById(`datalist-${subfieldId}`);
                    if (inputElement && dropdownElement) {
                        const formattedOptions = options.map(opt => typeof opt === 'object' ? opt : { value: opt, label: '' });
                        initCustomDatalist(inputElement, dropdownElement, formattedOptions);
                    }
                }
            }
        }
    }
}

// 加载条目子字段的关联选项
async function loadLinkedSubfieldOptions(rowIndex, field) {
    const entries = dataRows[rowIndex].data[field.name] || [];
    
    for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
        for (const subfield of field.subfields) {
            if (subfield.type === 'option' || subfield.type === 'datalist') {
                const subfieldId = `entry-${rowIndex}-${field.name}-${entryIndex}-${subfield.name}`;
                
                // 检查是否是关联配表或枚举模式
                if (subfield.dataSource && (subfield.dataSource.type === 'linked' || subfield.dataSource.type === 'enum')) {
                    const options = await getFieldOptions(subfield);
                    const currentValue = entries[entryIndex][subfield.name] || '';
                    
                    // 更新选项
                    if (subfield.type === 'option') {
                        const selectElement = document.getElementById(subfieldId);
                        if (selectElement) {
                            const optionsHtml = options.map(opt => 
                                `<option value="${escapeHtml(opt)}" ${currentValue === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`
                            ).join('');
                            selectElement.innerHTML = `<option value="">-- 请选择 --</option>${optionsHtml}`;
                        }
                    } else if (subfield.type === 'datalist') {
                        const inputElement = document.getElementById(subfieldId);
                        const dropdownElement = document.getElementById(`datalist-${subfieldId}`);
                        if (inputElement && dropdownElement) {
                            const formattedOptions = options.map(opt => 
                                typeof opt === 'string' ? { value: opt, label: '' } : opt
                            );
                            initCustomDatalist(inputElement, dropdownElement, formattedOptions);
                        }
                    }
                } else {
                    // 手动模式，直接使用 subfield.options
                    const currentValue = entries[entryIndex][subfield.name] || '';
                    const options = subfield.options || [];
                    
                    if (subfield.type === 'option') {
                        const selectElement = document.getElementById(subfieldId);
                        if (selectElement) {
                            const optionsHtml = options.map(opt => 
                                `<option value="${escapeHtml(opt)}" ${currentValue === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`
                            ).join('');
                            selectElement.innerHTML = `<option value="">-- 请选择 --</option>${optionsHtml}`;
                        }
                    } else if (subfield.type === 'datalist') {
                        const inputElement = document.getElementById(subfieldId);
                        const dropdownElement = document.getElementById(`datalist-${subfieldId}`);
                        if (inputElement && dropdownElement) {
                            const formattedOptions = options.map(opt => {
                                if (typeof opt === 'object') {
                                    return opt;
                                }
                                return { value: opt, label: '' };
                            });
                            initCustomDatalist(inputElement, dropdownElement, formattedOptions);
                        }
                    }
                }
            }
        }
    }
}

function createFieldInput(field, value, rowIndex) {
    const fieldId = `field-${rowIndex}-${field.name}`;
    
    let inputHtml = '';

    switch (field.type) {
        case 'text':
            inputHtml = `<input type="text" id="${fieldId}" class="form-control" value="${escapeHtml(value)}" ${field.required ? 'required' : ''}>`;
            break;
        
        case 'number':
            inputHtml = `<input type="number" id="${fieldId}" class="form-control" value="${value}" ${field.required ? 'required' : ''}>`;
            break;
        
        case 'color':
            // 颜色选择器：包含色盘和文本输入框
            const hexValue = value ? String(value).replace(/^0x/i, '') : 'FFFFFF';
            const colorValue = '#' + hexValue;
            inputHtml = `
                <div class="color-input-wrapper">
                    <input type="color" id="${fieldId}-picker" class="color-picker" value="${colorValue}" 
                           onchange="updateColorFromPicker('${fieldId}', this.value)">
                    <input type="text" id="${fieldId}" class="form-control color-text-input" value="${value || '0xFFFFFF'}" 
                           ${field.required ? 'required' : ''}
                           oninput="updateColorFromText('${fieldId}', this.value)"
                           placeholder="0xFFFFFF">
                    <div class="color-preview" id="${fieldId}-preview" style="background-color: ${colorValue};"></div>
                </div>
            `;
            break;
        
        case 'option':
            // 使用占位符，稍后异步加载选项
            inputHtml = `<select id="${fieldId}" class="form-control linked-field" data-field-name="${field.name}" ${field.required ? 'required' : ''}>
                <option value="">-- 加载中... --</option>
            </select>`;
            break;
        
        case 'datalist':
            const datalistId = `datalist-${fieldId}`;
            // 使用自定义下拉列表
            inputHtml = `
                <div class="custom-datalist-wrapper" data-datalist-id="${datalistId}">
                    <input type="text" 
                           id="${fieldId}" 
                           class="custom-datalist-input" 
                           data-field-name="${field.name}" 
                           value="${escapeHtml(value)}" 
                           ${field.required ? 'required' : ''}
                           autocomplete="off"
                           placeholder="请输入或选择...">
                    <div class="custom-datalist-dropdown" id="${datalistId}">
                        <div class="custom-datalist-empty">加载中...</div>
                    </div>
                </div>
            `;
            break;
        
        case 'dict':
            inputHtml = createDictInput(field, value, rowIndex);
            return `
                <div class="form-group" style="grid-column: 1 / -1;">
                    ${inputHtml}
                </div>
            `;
        
        case 'entry':
            inputHtml = createEntryInput(field, value, rowIndex);
            return `
                <div class="form-group" style="grid-column: 1 / -1;">
                    ${inputHtml}
                </div>
            `;
        case 'dict':
            inputHtml = createDictInput(field, value, rowIndex);
            return `
                <div class="form-group" style="grid-column: 1 / -1;">
                    ${inputHtml}
                </div>
            `;
        case 'list':
            inputHtml = createListInput(field, value, rowIndex);
            return `
                <div class="form-group" style="grid-column: 1 / -1;">
                    ${inputHtml}
                </div>
            `;
        
        case 'flags':
            const flagsValue = value || 0;
            inputHtml = `
                <div class="flags-input-wrapper">
                    <input type="number" id="${fieldId}" class="form-control" value="${flagsValue}" readonly style="background-color: #f8f9fa;">
                    <button type="button" class="btn btn-primary btn-sm" onclick="openFlagsModal(${rowIndex}, '${field.name}', ${flagsValue})">
                        <i class="fas fa-flag"></i> 选择标志
                    </button>
                </div>
            `;
            break;
    }

    const rawBadge = field.isRaw ? '<span class="raw-badge" title="此字段Lua导出时不加引号">原始</span>' : '';
    
    return `
        <div class="form-group">
            <label>${escapeHtml(field.label || field.name)}${field.required ? ' *' : ''} ${rawBadge}</label>
            ${inputHtml}
        </div>
    `;
}

function createDictInput(field, value, rowIndex) {
    // 字典是单个对象，不是数组
    const dictData = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
    const subfields = field.subfields || [];
    
    const subfieldsHtml = subfields.map((subfield) => {
        const subfieldValue = dictData[subfield.name] || '';
        const subfieldId = `dict-${rowIndex}-${field.name}-${subfield.name}`;
        let inputHtml = '';
        
        switch (subfield.type) {
            case 'text':
                inputHtml = `<input type="text" id="${subfieldId}" class="form-control" value="${escapeHtml(subfieldValue)}">`;
                break;
            case 'number':
                inputHtml = `<input type="number" id="${subfieldId}" class="form-control" value="${subfieldValue}">`;
                break;
            case 'color':
                const hexValue = subfieldValue ? String(subfieldValue).replace(/^0x/i, '') : 'FFFFFF';
                const colorValue = '#' + hexValue;
                inputHtml = `
                    <div class="color-input-wrapper">
                        <input type="color" id="${subfieldId}-picker" class="color-picker" value="${colorValue}" onchange="updateColorFromPicker('${subfieldId}', this.value)">
                        <input type="text" id="${subfieldId}" class="form-control color-text-input" value="${subfieldValue || '0xFFFFFF'}" oninput="updateColorFromText('${subfieldId}', this.value)" placeholder="0xFFFFFF">
                        <div class="color-preview" id="${subfieldId}-preview" style="background-color: ${colorValue};"></div>
                    </div>
                `;
                break;
            case 'option':
                inputHtml = `<select id="${subfieldId}" class="form-control linked-field" data-field-name="${subfield.name}"><option value="">-- 加载中... --</option></select>`;
                break;
            case 'datalist':
                const datalistId = `datalist-${subfieldId}`;
                inputHtml = `
                    <div class="custom-datalist-wrapper" data-datalist-id="${datalistId}">
                        <input type="text" id="${subfieldId}" class="custom-datalist-input" value="${escapeHtml(subfieldValue)}" autocomplete="off" placeholder="请输入或选择...">
                        <div class="custom-datalist-dropdown" id="${datalistId}"><div class="custom-datalist-empty">加载中...</div></div>
                    </div>
                `;
                break;
        }
        
        const rawBadge = subfield.isRaw ? '<span class="raw-badge" title="此字段Lua导出时不加引号">原始</span>' : '';
        return `
            <div class="dict-field-item">
                <label>${escapeHtml(subfield.label || subfield.name)}${subfield.required ? ' *' : ''} ${rawBadge}</label>
                ${inputHtml}
            </div>
        `;
    }).join('');
    
    return `
        <div class="dict-container" data-row="${rowIndex}" data-field="${field.name}">
            <div class="dict-header">
                <label>${escapeHtml(field.label || field.name)}</label>
            </div>
            <div class="dict-fields">
                ${subfieldsHtml}
            </div>
        </div>
    `;
}

function createEntryInput(field, value, rowIndex) {
    const entries = Array.isArray(value) ? value : [];
    const entriesHtml = entries.map((entry, entryIndex) => 
        createEntryItem(field, entry, rowIndex, entryIndex)
    ).join('');

    return `
        <div class="entry-container" data-row="${rowIndex}" data-field="${field.name}">
            <div class="entry-header">
                <label>${escapeHtml(field.label || field.name)}</label>
                <button type="button" class="btn btn-sm btn-primary" onclick="addEntryItem(${rowIndex}, '${field.name}')">
                    <i class="fas fa-plus"></i> 添加条目
                </button>
            </div>
            <div class="entry-items">
                ${entriesHtml || '<p style="color: #95a5a6; text-align: center; padding: 10px;">暂无条目</p>'}
            </div>
        </div>
    `;
}

function createListInput(field, value, rowIndex) {
    const items = Array.isArray(value) ? value : [];
    const itemsHtml = items.map((it, idx) => createListItem(field, it, rowIndex, idx)).join('');

    return `
        <div class="list-container" data-row="${rowIndex}" data-field="${field.name}">
            <div class="list-header">
                <label>${escapeHtml(field.label || field.name)}</label>
                <button type="button" class="btn btn-sm btn-primary" onclick="addListItem(${rowIndex}, '${field.name}')">
                    <i class="fas fa-plus"></i> 添加元素
                </button>
            </div>
            <div class="list-items">
                ${itemsHtml || '<p style="color: #95a5a6; text-align: center; padding: 10px;">暂无元素</p>'}
            </div>
        </div>
    `;
}

function createListItem(field, value, rowIndex, itemIndex) {
    const elementType = field.elementType || 'text';
    const itemId = `list-${rowIndex}-${field.name}-${itemIndex}`;
    let inputHtml = '';

    switch (elementType) {
        case 'text':
            inputHtml = `<input type="text" id="${itemId}" class="form-control" value="${escapeHtml(value)}">`;
            break;
        case 'number':
            inputHtml = `<input type="number" id="${itemId}" class="form-control" value="${value}">`;
            break;
        case 'color':
            const hexValue = value ? String(value).replace(/^0x/i, '') : 'FFFFFF';
            const colorValue = '#' + hexValue;
            inputHtml = `
                <div class="color-input-wrapper">
                    <input type="color" id="${itemId}-picker" class="color-picker" value="${colorValue}" onchange="updateColorFromPicker('${itemId}', this.value)">
                    <input type="text" id="${itemId}" class="form-control color-text-input" value="${value || '0xFFFFFF'}" oninput="updateColorFromText('${itemId}', this.value)" placeholder="0xFFFFFF">
                    <div class="color-preview" id="${itemId}-preview" style="background-color: ${colorValue};"></div>
                </div>
            `;
            break;
        case 'option':
            inputHtml = `<select id="${itemId}" class="form-control linked-field" data-field-name="${field.name}"><option value="">-- 加载中... --</option></select>`;
            break;
        case 'datalist':
            const datalistId = `datalist-${itemId}`;
            inputHtml = `
                <div class="custom-datalist-wrapper" data-datalist-id="${datalistId}">
                    <input type="text" id="${itemId}" class="custom-datalist-input" value="${escapeHtml(value)}" autocomplete="off" placeholder="请输入或选择...">
                    <div class="custom-datalist-dropdown" id="${datalistId}"><div class="custom-datalist-empty">加载中...</div></div>
                </div>
            `;
            break;
    }

    return `
        <div class="list-item">
            <div class="list-item-value">${inputHtml}</div>
            <div class="list-item-actions">
                <button type="button" class="btn btn-sm btn-danger" onclick="removeListItem(${rowIndex}, '${field.name}', ${itemIndex})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

async function addListItem(rowIndex, fieldName) {
    if (!currentSchema || !currentSchema.fields) return;
    const field = currentSchema.fields.find(f => f.name === fieldName);
    if (!field) return;

    const container = document.querySelector(`.list-container[data-row="${rowIndex}"][data-field="${fieldName}"] .list-items`);
    if (!container) return;

    if (container.querySelector('p')) container.innerHTML = '';

    const currentCount = container.querySelectorAll('.list-item').length;
    const newItemValue = '';
    const itemHtml = createListItem(field, newItemValue, rowIndex, currentCount);
    container.insertAdjacentHTML('beforeend', itemHtml);

    // 如果元素类型需要异步加载选项，加载它们
    if (field.elementType === 'option' || field.elementType === 'datalist') {
        const options = await getFieldOptions(field);
        const itemId = `list-${rowIndex}-${fieldName}-${currentCount}`;

        if (field.elementType === 'option') {
            const selectEl = document.getElementById(itemId);
            if (selectEl) {
                const optionsHtml = options.map(opt => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join('');
                selectEl.innerHTML = `<option value="">-- 请选择 --</option>${optionsHtml}`;
            }
        } else if (field.elementType === 'datalist') {
            const inputElement = document.getElementById(itemId);
            const dropdownElement = document.getElementById(`datalist-${itemId}`);
            if (inputElement && dropdownElement) {
                // 格式化选项并初始化自定义 datalist
                const formattedOptions = options.map(opt => 
                    typeof opt === 'object' ? opt : { value: opt, label: '' }
                );
                initCustomDatalist(inputElement, dropdownElement, formattedOptions);
            }
        }
    }
}

function removeListItem(rowIndex, fieldName, itemIndex) {
    const container = document.querySelector(`.list-container[data-row="${rowIndex}"][data-field="${fieldName}"] .list-items`);
    const item = container.querySelectorAll('.list-item')[itemIndex];
    if (item) {
        item.remove();
        // 重新编号（通过重新渲染索引顺序）
        container.querySelectorAll('.list-item').forEach((it, idx) => {
            // nothing to change in DOM ids; indexing works on query order when collecting
        });

        if (container.querySelectorAll('.list-item').length === 0) {
            container.innerHTML = '<p style="color: #95a5a6; text-align: center; padding: 10px;">暂无元素</p>';
        }
    }
}

function collectListDataFromContainer(container, field) {
    const items = container.querySelectorAll('.list-item');
    const values = [];
    items.forEach((item, idx) => {
        const input = item.querySelector('input, select');
        if (input) {
            values.push(input.value);
        }
    });
    return values;
}

function createEntryItem(field, entry, rowIndex, entryIndex) {
    const subfields = field.subfields || [];
    const subfieldsHtml = subfields.map(subfield => {
        // 使用工具函数获取字段值，支持数字键
        const value = getFieldValue(entry, subfield.name) ?? subfield.defaultValue ?? '';
        const subfieldId = `entry-${rowIndex}-${field.name}-${entryIndex}-${subfield.name}`;

        let inputHtml = '';

        switch (subfield.type) {
            case 'text':
                inputHtml = `<input type="text" id="${subfieldId}" class="form-control" value="${escapeHtml(value)}">`;
                break;
            
            case 'number':
                inputHtml = `<input type="number" id="${subfieldId}" class="form-control" value="${value}">`;
                break;
            
            case 'color':
                // 颜色选择器：包含色盘和文本输入框
                const hexValue = value ? String(value).replace(/^0x/i, '') : 'FFFFFF';
                const colorValue = '#' + hexValue;
                inputHtml = `
                    <div class="color-input-wrapper">
                        <input type="color" id="${subfieldId}-picker" class="color-picker" value="${colorValue}" 
                               onchange="updateColorFromPicker('${subfieldId}', this.value)">
                        <input type="text" id="${subfieldId}" class="form-control color-text-input" value="${value || '0xFFFFFF'}" 
                               oninput="updateColorFromText('${subfieldId}', this.value)"
                               placeholder="0xFFFFFF">
                        <div class="color-preview" id="${subfieldId}-preview" style="background-color: ${colorValue};"></div>
                    </div>
                `;
                break;
            
            case 'option':
                // 使用占位符，稍后异步加载选项
                inputHtml = `<select id="${subfieldId}" class="form-control">
                    <option value="">-- 加载中... --</option>
                </select>`;
                break;
            
            case 'datalist':
                const datalistId = `datalist-${subfieldId}`;
                // 使用自定义下拉列表
                inputHtml = `
                    <div class="custom-datalist-wrapper" data-datalist-id="${datalistId}">
                        <input type="text" 
                               id="${subfieldId}" 
                               class="custom-datalist-input" 
                               value="${escapeHtml(value)}"
                               autocomplete="off"
                               placeholder="请输入或选择...">
                        <div class="custom-datalist-dropdown" id="${datalistId}">
                            <div class="custom-datalist-empty">加载中...</div>
                        </div>
                    </div>
                `;
                break;
        }

        return `
            <div class="entry-item-field">
                <label>${escapeHtml(subfield.label || subfield.name)}</label>
                ${inputHtml}
            </div>
        `;
    }).join('');

    return `
        <div class="entry-item" data-entry-index="${entryIndex}">
            ${subfieldsHtml}
            <div class="entry-item-actions">
                <button type="button" class="btn btn-sm btn-danger" onclick="removeEntryItem(${rowIndex}, '${field.name}', ${entryIndex})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

function addDataRow() {
    const newRowData = {};
    
    // 使用默认值初始化新行
    (currentSchema.fields || []).forEach(field => {
        if (field.type === 'entry' || field.type === 'list') {
            newRowData[field.name] = [];
        } else {
            newRowData[field.name] = field.defaultValue || '';
        }
    });

    const newDataRow = {
        name: `数据行 ${dataRows.length + 1}`,
        data: newRowData
    };

    // 在添加新数据行前，先保存当前编辑的数据
    saveCurrentEditToMemory();

    dataRows.push(newDataRow);
    selectedDataRowIndex = dataRows.length - 1;
    
    renderDataRowsList();
    renderDataRowEditor(selectedDataRowIndex);
}

function removeDataRow(index) {
    // 在删除前，先保存当前编辑的数据（如果不是删除当前选中的）
    if (selectedDataRowIndex !== index) {
        saveCurrentEditToMemory();
    }
    
    dataRows.splice(index, 1);
    
    // 如果删除的是当前选中的数据行，重置选择
    if (selectedDataRowIndex === index) {
        selectedDataRowIndex = -1;
        document.getElementById('data-row-editor-container').innerHTML = 
            '<div class="empty-state"><i class="fas fa-hand-pointer"></i><p>请从左侧选择数据行</p></div>';
    } else if (selectedDataRowIndex > index) {
        selectedDataRowIndex--;
    }
    
    renderDataRowsList();
    
    // 如果还有数据行且之前有选中，重新渲染编辑器
    if (selectedDataRowIndex >= 0 && selectedDataRowIndex < dataRows.length) {
        renderDataRowEditor(selectedDataRowIndex);
    }
}

async function addEntryItem(rowIndex, fieldName) {
    if (!currentSchema || !currentSchema.fields) return;
    const field = currentSchema.fields.find(f => f.name === fieldName);
    if (!field) return;

    const container = document.querySelector(`.entry-container[data-row="${rowIndex}"][data-field="${fieldName}"] .entry-items`);
    
    // 如果容器只有提示文字，先清空
    if (container.querySelector('p')) {
        container.innerHTML = '';
    }

    const currentItemCount = container.querySelectorAll('.entry-item').length;
    const newEntry = {};
    
    // 使用默认值初始化新条目，支持数字键
    (field.subfields || []).forEach(subfield => {
        setFieldValue(newEntry, subfield.name, subfield.defaultValue || '');
    });

    const itemHtml = createEntryItem(field, newEntry, rowIndex, currentItemCount);
    container.insertAdjacentHTML('beforeend', itemHtml);
    
    // 加载新添加条目的关联子字段选项
    for (const subfield of field.subfields || []) {
        if (subfield.type === 'option' || subfield.type === 'datalist') {
            const subfieldId = `entry-${rowIndex}-${fieldName}-${currentItemCount}-${subfield.name}`;
            
            if (subfield.dataSource && (subfield.dataSource.type === 'linked' || subfield.dataSource.type === 'enum')) {
                const options = await getFieldOptions(subfield);
                
                if (subfield.type === 'option') {
                    const selectElement = document.getElementById(subfieldId);
                    if (selectElement) {
                        const optionsHtml = options.map(opt => 
                            `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`
                        ).join('');
                        selectElement.innerHTML = `<option value="">-- 请选择 --</option>${optionsHtml}`;
                    }
                } else if (subfield.type === 'datalist') {
                    const datalistElement = document.getElementById(`datalist-${subfieldId}`);
                    if (datalistElement) {
                        const optionsHtml = options.map(opt => 
                            `<option value="${escapeHtml(opt)}"></option>`
                        ).join('');
                        datalistElement.innerHTML = optionsHtml;
                    }
                }
            } else {
                // 手动模式，直接使用 subfield.options
                const options = subfield.options || [];
                
                if (subfield.type === 'option') {
                    const selectElement = document.getElementById(subfieldId);
                    if (selectElement) {
                        const optionsHtml = options.map(opt => 
                            `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`
                        ).join('');
                        selectElement.innerHTML = `<option value="">-- 请选择 --</option>${optionsHtml}`;
                    }
                } else if (subfield.type === 'datalist') {
                    const datalistElement = document.getElementById(`datalist-${subfieldId}`);
                    if (datalistElement) {
                        const datalistOptions = options.map(opt => {
                            if (typeof opt === 'object') {
                                return `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`;
                            }
                            return `<option value="${escapeHtml(opt)}"></option>`;
                        }).join('');
                        datalistElement.innerHTML = datalistOptions;
                    }
                }
            }
        }
    }
}

function removeEntryItem(rowIndex, fieldName, entryIndex) {
    const container = document.querySelector(`.entry-container[data-row="${rowIndex}"][data-field="${fieldName}"] .entry-items`);
    const item = container.querySelector(`.entry-item[data-entry-index="${entryIndex}"]`);
    
    if (item) {
        item.remove();
        
        // 重新编号
        container.querySelectorAll('.entry-item').forEach((item, newIndex) => {
            item.dataset.entryIndex = newIndex;
        });

        // 如果没有条目了，显示提示
        if (container.querySelectorAll('.entry-item').length === 0) {
            container.innerHTML = '<p style="color: #95a5a6; text-align: center; padding: 10px;">暂无条目</p>';
        }
    }
}

async function saveData() {
    // 在保存前，先将当前编辑器中的数据保存到内存
    saveCurrentEditToMemory();
    
    const data = collectData();
    
    // 保存完整的 dataRows 信息（包括 name 和 isRaw）
    const dataWithMeta = dataRows.map((dataRow, index) => ({
        name: dataRow.name,
        isRaw: dataRow.isRaw || false,
        data: data[index]
    }));

    try {
        const response = await fetch(API.DATA, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'update',
                name: currentSchemaName,
                data: dataWithMeta
            })
        });

        const result = await response.json();
        
        if (result.success) {
            alert('配表数据保存成功');
            
            // 保存当前编辑的数据行索引
            const currentEditingIndex = selectedDataRowIndex;
            
            // 重新从服务器加载数据以确保数据同步
            await reloadCurrentData();
            
            // 如果之前有选中的数据行，重新选中并渲染
            if (currentEditingIndex >= 0 && currentEditingIndex < dataRows.length) {
                selectedDataRowIndex = currentEditingIndex;
                renderDataRowsList();
                await renderDataRowEditor(currentEditingIndex);
            }
        } else {
            alert('保存配表数据失败: ' + result.error);
        }
    } catch (error) {
        console.error('保存配表数据错误:', error);
        alert('保存配表数据失败');
    }
}

// 重新加载当前配表数据（不改变UI状态）
async function reloadCurrentData() {
    try {
        const dataResponse = await fetch(`${API.DATA}?action=get&name=${encodeURIComponent(currentSchemaName)}`);
        const dataResult = await dataResponse.json();
        
        if (dataResult.success) {
            const loadedData = dataResult.data || [];
            dataRows = loadedData.map((row, index) => {
                // 兼容新旧格式
                if (row.name !== undefined && row.data !== undefined) {
                    return {
                        name: row.name,
                        isRaw: row.isRaw || false,
                        data: row.data
                    };
                } else {
                    return {
                        name: `数据行 ${index + 1}`,
                        isRaw: false,
                        data: row
                    };
                }
            });
        }
    } catch (error) {
        console.error('重新加载数据错误:', error);
    }
}

function previewData() {
    const modal = document.getElementById('preview-modal');
    modal.classList.add('show');
    
    const container = document.getElementById('preview-container');
    const data = collectData();
    
    // 存储数据和 schema 供脚本使用
    window.previewDataCache = data;
    window.previewSchemaCache = currentSchema;
    
    let html = `<div class="preview-scroll-container">
        <div class="preview-top-scrollbar" id="preview-top-scrollbar" title="横向滚动条">
            <div class="preview-top-scrollbar-content" id="preview-top-scrollbar-content"></div>
        </div>
        <div class="preview-table-wrapper" id="preview-table-wrapper">
            <table class="preview-table" id="preview-table">
                <thead>
                    <tr>
                        <th>数据行名称</th>`;
    
    // 表头
    const fields = currentSchema.fields || [];
    fields.forEach(field => {
        html += `<th>${escapeHtml(field.label || field.name)}</th>`;
    });
    html += '</tr></thead><tbody>';
    
    // 数据行
    dataRows.forEach((dataRow, index) => {
        const rowData = data[index];
        html += `<tr>
            <td class="preview-row-name">${escapeHtml(dataRow.name)}${dataRow.isRaw ? ' <span class="raw-badge">原始</span>' : ''}</td>`;
        
        fields.forEach(field => {
            // 使用工具函数获取字段值，支持数字键
            let value = getFieldValue(rowData, field.name);
            let isHtml = false;
            if (field.type === 'entry') {
                value = `${Array.isArray(value) ? value.length : 0} 项`;
            } else if (field.type === 'color' && value) {
                // 显示颜色方块和值
                const hex = String(value).replace(/^0x/i, '');
                const colorValue = '#' + hex;
                value = `<div class="preview-color-wrapper"><div class="preview-color-box" style="background-color: ${colorValue};"></div><span>${value}</span></div>`;
                isHtml = true;
            } else if (value === '' || value === null || value === undefined) {
                value = '<span class="empty-value">nil</span>';
                isHtml = true;
            }
            html += `<td>${isHtml ? value : escapeHtml(String(value))}</td>`;
        });
        
        html += '</tr>';
    });
    
    html += '</tbody></table></div></div>';
    container.innerHTML = html;
    
    // 初始化滚动条同步
    initPreviewScrollSync();
    
    // 初始化代码编辑器（如果还没有初始化）
    initScriptEditor();
}

function initPreviewScrollSync() {
    const topScrollbar = document.getElementById('preview-top-scrollbar');
    const tableWrapper = document.getElementById('preview-table-wrapper');
    const topScrollbarContent = document.getElementById('preview-top-scrollbar-content');
    const table = document.getElementById('preview-table');
    
    if (!topScrollbar || !tableWrapper || !topScrollbarContent || !table) {
        return;
    }
    
    // 设置顶部滚动条内容宽度与表格一致
    const updateScrollbarWidth = () => {
        topScrollbarContent.style.width = table.scrollWidth + 'px';
    };
    
    updateScrollbarWidth();
    
    // 同步顶部滚动条 -> 表格
    topScrollbar.addEventListener('scroll', () => {
        tableWrapper.scrollLeft = topScrollbar.scrollLeft;
    });
    
    // 同步表格 -> 顶部滚动条
    tableWrapper.addEventListener('scroll', () => {
        topScrollbar.scrollLeft = tableWrapper.scrollLeft;
    });
    
    // 监听窗口大小变化
    const resizeObserver = new ResizeObserver(() => {
        updateScrollbarWidth();
    });
    
    resizeObserver.observe(table);
}

async function closePreviewModal() {
    // 退出预览时自动保存脚本
    await savePreviewScript(true);
    
    const modal = document.getElementById('preview-modal');
    modal.classList.remove('show');
    
    // 清除缓存数据
    window.previewDataCache = null;
    window.previewSchemaCache = null;
    
    // 清除脚本结果
    clearScriptResult();
}

// ========== 脚本执行功能 ==========

async function executeScript() {
    const resultContainer = document.getElementById('script-result-container');
    const resultContent = document.getElementById('script-result-content');
    const resultCount = resultContainer.querySelector('.result-count');
    
    // 从 CodeMirror 编辑器或 textarea 获取代码
    const scriptCode = scriptEditor ? scriptEditor.getValue().trim() : document.getElementById('preview-script-input').value.trim();
    
    if (!scriptCode) {
        alert('请输入处理函数');
        return;
    }
    
    if (!window.previewDataCache) {
        alert('没有可用的预览数据');
        return;
    }
    
    try {
        // 解析用户输入的函数
        let userFunction;
        
        // 尝试解析箭头函数或普通函数
        // 支持格式: (index, data, source) => {...} 或 function(index, data, source) {...}
        const arrowFuncMatch = scriptCode.match(/^\s*\(([^)]*)\)\s*=>\s*\{([\s\S]*)\}\s*$/);
        const funcMatch = scriptCode.match(/^\s*function\s*\(([^)]*)\)\s*\{([\s\S]*)\}\s*$/);
        
        if (arrowFuncMatch) {
            // 箭头函数
            const params = arrowFuncMatch[1];
            const body = arrowFuncMatch[2];
            userFunction = new Function(params, body);
        } else if (funcMatch) {
            // 普通函数
            const params = funcMatch[1];
            const body = funcMatch[2];
            userFunction = new Function(params, body);
        } else {
            // 尝试直接执行（可能是简化的箭头函数 (index, data) => data.field）
            try {
                userFunction = eval(`(${scriptCode})`);
                if (typeof userFunction !== 'function') {
                    throw new Error('输入的不是有效的函数');
                }
            } catch (e) {
                throw new Error('函数格式错误。支持格式:\n(index, data, source) => { ... }\n或\nfunction(index, data, source) { ... }');
            }
        }
        
        // 准备只读的数据副本（深拷贝以防止意外修改）
        const data = window.previewDataCache;
        const sourceData = data.map(row => deepFreeze(deepClone(row)));
        
        // 存储更新记录
        const updates = new Map();
        
        // 执行函数处理每行数据
        const results = [];
        const errors = [];
        
        for (let i = 0; i < data.length; i++) {
            try {
                // 创建 update 函数（在用户函数内部可直接调用）
                const update = function(index, newData) {
                    if (index < 0 || index >= data.length) {
                        throw new Error(`update: 索引 ${index} 超出范围 (0-${data.length - 1})`);
                    }
                    
                    if (typeof newData !== 'object' || newData === null) {
                        throw new Error('update: newData 必须是一个对象');
                    }
                    
                    // 验证字段
                    const schema = window.previewSchemaCache;
                    if (schema && schema.fields) {
                        const allowedFields = new Set(schema.fields.map(f => f.name));
                        const fieldMap = {};
                        schema.fields.forEach(f => fieldMap[f.name] = f);
                        
                        // 检查是否有非法字段
                        for (const key in newData) {
                            if (!allowedFields.has(key)) {
                                throw new Error(`update: 字段 "${key}" 在原表中不存在`);
                            }
                        }
                        
                        // 类型转换和验证
                        const validatedData = {};
                        for (const key in newData) {
                            const field = fieldMap[key];
                            const value = newData[key];
                            
                            try {
                                validatedData[key] = convertFieldValue(value, field);
                            } catch (e) {
                                throw new Error(`update: 字段 "${key}" 类型转换失败: ${e.message}`);
                            }
                        }
                        
                        updates.set(index, validatedData);
                    } else {
                        updates.set(index, { ...newData });
                    }
                };
                
                // 将 update 函数注入到全局作用域（临时）
                const originalUpdate = window.update;
                window.update = update;
                
                try {
                    // 传入：index, data (只读), source (只读)
                    // update 函数通过全局作用域访问
                    const result = userFunction(i, deepClone(data[i]), sourceData);
                    
                    // 如果有返回值
                    if (result !== undefined && result !== null) {
                        // 如果当前行调用了 update(),将更新应用到返回值上
                        if (updates.has(i)) {
                            const updatedFields = updates.get(i);
                            
                            // 如果返回值是对象,应用更新到对应字段
                            if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
                                const mergedResult = { ...result };
                                for (const key in updatedFields) {
                                    if (key in mergedResult) {
                                        mergedResult[key] = updatedFields[key];
                                    }
                                }
                                results.push({ index: i, value: mergedResult });
                            } else {
                                // 返回值不是对象,直接使用原返回值
                                results.push({ index: i, value: result });
                            }
                        } else {
                            // 没有调用 update(),直接使用返回值
                            results.push({ index: i, value: result });
                        }
                    }
                } finally {
                    // 恢复原始的 update 函数
                    if (originalUpdate !== undefined) {
                        window.update = originalUpdate;
                    } else {
                        delete window.update;
                    }
                }
            } catch (err) {
                // 记录错误
                errors.push({ index: i, error: err.message });
            }
        }
        
        // 保存更新记录供后续应用
        window.scriptUpdates = updates;
        const hasUpdates = updates.size > 0;
        
        // 显示结果
        displayScriptResults(results, resultContainer, resultContent, resultCount, errors, hasUpdates);
        
    } catch (error) {
        // 显示错误
        resultContent.innerHTML = `
            <div class="script-error">
                <div class="script-error-title">
                    <i class="fas fa-exclamation-triangle"></i> 执行错误
                </div>
                <div>${escapeHtml(error.message)}</div>
            </div>
        `;
        resultContainer.style.display = 'block';
        resultCount.textContent = '';
    }
}

function displayScriptResults(results, container, content, countElement, errors, hasModifications) {
    // 保存结果供复制使用
    window.scriptResultsCache = results;
    
    let htmlContent = '';
    
    // 如果有错误,在顶部显示错误警告
    if (errors && errors.length > 0) {
        htmlContent += `
            <div class="script-execution-errors">
                <div class="script-execution-errors-title">
                    <i class="fas fa-exclamation-triangle"></i> 
                    执行警告 (${errors.length} 行失败)
                </div>
                <div class="script-execution-errors-list">`;
        
        errors.forEach(err => {
            htmlContent += `
                    <div class="script-execution-error-item">
                        <span class="error-row-index">第 ${err.index} 行:</span> ${escapeHtml(err.error)}
                    </div>`;
        });
        
        htmlContent += `
                </div>
            </div>`;
    }
    
    if (results.length === 0) {
        htmlContent += `
            <div class="script-empty-result">
                <i class="fas fa-inbox"></i>
                <div>没有返回结果</div>
                <div style="font-size: 11px; margin-top: 6px; color: #bdc3c7;">
                    函数可能返回了 undefined 或 null，或者没有匹配的数据
                </div>
            </div>
        `;
        content.innerHTML = htmlContent;
        countElement.textContent = '(0 项)';
    } else {
        // 检查结果类型，决定显示方式
        const firstValue = results[0].value;
        
        if (typeof firstValue === 'object' && firstValue !== null && !Array.isArray(firstValue)) {
            // 对象类型 - 显示为表格
            htmlContent += formatResultsAsTable(results);
        } else {
            // 简单类型 - 显示为列表
            results.forEach(({ index, value }) => {
                const displayValue = formatScriptResultValue(value);
                htmlContent += `
                    <div class="script-result-item">
                        <span class="script-result-index">${index}</span>
                        <span class="script-result-value">${displayValue}</span>
                    </div>
                `;
            });
        }
        
        content.innerHTML = htmlContent;
        
        countElement.textContent = `(${results.length} 项)`;
    }
    
    // 更新"应用修改"按钮的显示状态
    updateApplyModificationsButton(hasModifications);
    
    // 显示结果容器
    container.style.display = 'flex';
    
    // 调整右侧面板布局：原表和结果各占一半
    const originalSection = document.querySelector('.preview-original');
    if (originalSection) {
        originalSection.style.flex = '1';
    }
}

function formatResultsAsTable(results) {
    if (!window.previewSchemaCache) {
        // 没有 schema 信息，使用简单表格
        return formatResultsAsSimpleTable(results);
    }
    
    const schema = window.previewSchemaCache;
    const fields = schema.fields || [];
    
    // 创建字段映射表
    const fieldMap = {};
    fields.forEach(field => {
        fieldMap[field.name] = field;
    });
    
    // 收集所有出现的键
    const allKeys = new Set();
    results.forEach(({ value }) => {
        if (typeof value === 'object' && value !== null) {
            Object.keys(value).forEach(key => allKeys.add(key));
        }
    });
    
    if (allKeys.size === 0) {
        return '<div class="script-empty-result">返回的对象为空</div>';
    }
    
    // 生成表格
    let html = `
        <div class="script-result-table-wrapper">
            <table class="script-result-table">
                <thead>
                    <tr>
                        <th class="result-index-col">索引</th>`;
    
    // 表头：优先显示字段标签
    allKeys.forEach(key => {
        const field = fieldMap[key];
        const label = field ? (field.label || field.name) : key;
        html += `<th>${escapeHtml(label)}</th>`;
    });
    
    html += '</tr></thead><tbody>';
    
    // 数据行
    results.forEach(({ index, value }) => {
        html += `<tr><td class="result-index-col">${index}</td>`;
        
        allKeys.forEach(key => {
            const cellValue = value[key];
            const field = fieldMap[key];
            
            // 根据字段类型格式化值
            const formattedValue = formatCellValueByField(cellValue, field);
            html += `<td>${formattedValue}</td>`;
        });
        
        html += '</tr>';
    });
    
    html += '</tbody></table></div>';
    
    return html;
}

function formatResultsAsSimpleTable(results) {
    // 收集所有键
    const allKeys = new Set();
    results.forEach(({ value }) => {
        if (typeof value === 'object' && value !== null) {
            Object.keys(value).forEach(key => allKeys.add(key));
        }
    });
    
    if (allKeys.size === 0) {
        return '<div class="script-empty-result">返回的对象为空</div>';
    }
    
    let html = `
        <div class="script-result-table-wrapper">
            <table class="script-result-table">
                <thead>
                    <tr>
                        <th class="result-index-col">索引</th>`;
    
    allKeys.forEach(key => {
        html += `<th>${escapeHtml(key)}</th>`;
    });
    
    html += '</tr></thead><tbody>';
    
    results.forEach(({ index, value }) => {
        html += `<tr><td class="result-index-col">${index}</td>`;
        
        allKeys.forEach(key => {
            const cellValue = value[key];
            const formatted = formatScriptResultValue(cellValue);
            html += `<td>${formatted}</td>`;
        });
        
        html += '</tr>';
    });
    
    html += '</tbody></table></div>';
    
    return html;
}

function formatCellValueByField(value, field) {
    // 空值处理
    if (value === '' || value === null || value === undefined) {
        return '<span class="empty-value">nil</span>';
    }
    
    // 没有字段定义，使用默认格式化
    if (!field) {
        return escapeHtml(String(value));
    }
    
    // 根据字段类型格式化
    switch (field.type) {
        case 'color':
            // 颜色字段
            const hex = String(value).replace(/^0x/i, '');
            const colorValue = '#' + hex;
            return `<div class="preview-color-wrapper">
                <div class="preview-color-box" style="background-color: ${colorValue};"></div>
                <span>${escapeHtml(String(value))}</span>
            </div>`;
        
        case 'option':
        case 'datalist':
            // 选项字段：如果有枚举或关联表，可以显示对应的标签
            // 这里简单显示值
            return escapeHtml(String(value));
        
        case 'list':
            // 列表字段 - 显示完整内容
            if (Array.isArray(value)) {
                // 显示数组内容，用逗号分隔
                const displayValue = value.join(', ');
                return `<span class="list-value">${escapeHtml(displayValue)}</span>`;
            }
            return escapeHtml(String(value));
        
        case 'entry':
            // 条目字段
            if (Array.isArray(value)) {
                return `<span class="entry-value">[${value.length} 条目]</span>`;
            }
            return escapeHtml(String(value));
        
        case 'dict':
            // 字典字段
            if (typeof value === 'object' && value !== null) {
                return `<span class="dict-value">{对象}</span>`;
            }
            return escapeHtml(String(value));
        
        case 'number':
            // 数字字段
            return `<span class="number-value">${escapeHtml(String(value))}</span>`;
        
        default:
            // 默认文本
            return escapeHtml(String(value));
    }
}

function formatScriptResultValue(value) {
    if (typeof value === 'object') {
        try {
            return escapeHtml(JSON.stringify(value, null, 2));
        } catch (e) {
            return escapeHtml(String(value));
        }
    }
    return escapeHtml(String(value));
}

function clearScriptResult() {
    const resultContainer = document.getElementById('script-result-container');
    const resultContent = document.getElementById('script-result-content');
    const scriptInput = document.getElementById('preview-script-input');
    
    resultContainer.style.display = 'none';
    resultContent.innerHTML = '';
    
    // 可选：也清空输入框
    // scriptInput.value = '';
}

function toggleScriptExamples() {
    const menu = document.getElementById('script-examples-menu');
    menu.classList.toggle('show');
    
    // 点击其他地方关闭菜单
    if (menu.classList.contains('show')) {
        setTimeout(() => {
            document.addEventListener('click', closeScriptExamplesOnClickOutside);
        }, 0);
    }
}

function closeScriptExamplesOnClickOutside(e) {
    const menu = document.getElementById('script-examples-menu');
    const button = event.target.closest('.script-examples-dropdown');
    
    if (!button && menu.classList.contains('show')) {
        menu.classList.remove('show');
        document.removeEventListener('click', closeScriptExamplesOnClickOutside);
    }
}

function loadScriptExample(type) {
    const menu = document.getElementById('script-examples-menu');
    
    const examples = {
        extract: `// 提取单个字段的值
(index, data) => {
    return data.fish_name;  // 替换为你需要的字段名
}`,
        
        filter: `// 筛选符合条件的数据
(index, data) => {
    if (data.rarity > 2) {  // 修改筛选条件
        return data;
    }
}`,
        
        transform: `// 组合多个字段
(index, data) => {
    return {
        id: data.fish_id,
        name: data.fish_name,
        info: data.fish_name + ' - 稀有度:' + data.rarity
    };
}`,
        
        calculate: `// 进行数值计算
(index, data) => {
    // 例如：计算价格折扣
    const discount = 0.8;
    return {
        original: data.price,
        discounted: data.price * discount
    };
}`
    };
    
    if (examples[type]) {
        // 更新 CodeMirror 或 textarea
        if (scriptEditor) {
            scriptEditor.setValue(examples[type]);
            scriptEditor.focus();
        } else {
            const scriptInput = document.getElementById('preview-script-input');
            scriptInput.value = examples[type];
            scriptInput.focus();
        }
    }
    
    menu.classList.remove('show');
    document.removeEventListener('click', closeScriptExamplesOnClickOutside);
}

function copyScriptResult() {
    if (!window.scriptResultsCache) {
        alert('没有可复制的结果');
        return;
    }
    
    try {
        // 将结果转换为 JSON 数组
        const resultArray = window.scriptResultsCache.map(item => item.value);
        const jsonString = JSON.stringify(resultArray, null, 2);
        
        // 复制到剪贴板
        navigator.clipboard.writeText(jsonString).then(() => {
            // 显示成功提示
            const button = event.target.closest('button');
            const originalHTML = button.innerHTML;
            button.innerHTML = '<i class="fas fa-check"></i> 已复制';
            button.disabled = true;
            
            setTimeout(() => {
                button.innerHTML = originalHTML;
                button.disabled = false;
            }, 2000);
        }).catch(err => {
            // 降级方案：使用 textarea
            const textarea = document.createElement('textarea');
            textarea.value = jsonString;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            
            alert('结果已复制到剪贴板');
        });
    } catch (error) {
        console.error('复制失败:', error);
        alert('复制失败: ' + error.message);
    }
}

// 更新"应用修改"按钮的显示状态
function updateApplyModificationsButton(hasUpdates) {
    const applyBtn = document.getElementById('apply-modifications-btn');
    const titleText = document.getElementById('result-title-text');
    
    if (applyBtn) {
        if (hasUpdates) {
            applyBtn.style.display = 'inline-flex';
            applyBtn.innerHTML = `<i class="fas fa-check"></i> 应用更新 (${window.scriptUpdates.size} 行)`;
            
            // 更新标题为"更新结果"
            if (titleText) {
                titleText.innerHTML = '<i class="fas fa-edit"></i> 更新结果';
            }
        } else {
            applyBtn.style.display = 'none';
            
            // 恢复标题为"查询结果"
            if (titleText) {
                titleText.innerHTML = '查询结果';
            }
        }
    }
}

// 应用更新到原始数据
function applyModifications() {
    if (!window.scriptUpdates || window.scriptUpdates.size === 0) {
        alert('没有需要应用的更新');
        return;
    }
    
    if (!confirm(`确定要应用 ${window.scriptUpdates.size} 行数据的更新吗？\n\n此操作将更新原始数据表。`)) {
        return;
    }
    
    try {
        // 应用所有更新到 dataRows
        window.scriptUpdates.forEach((updatedData, index) => {
            if (index >= 0 && index < dataRows.length) {
                // 合并更新数据到原始数据
                dataRows[index].data = {
                    ...dataRows[index].data,
                    ...updatedData
                };
            }
        });
        
        // 清除更新记录
        window.scriptUpdates.clear();
        
        // 刷新预览的原始数据表
        previewData();
        
        // 隐藏"应用修改"按钮
        updateApplyModificationsButton(false);
        
        // 清除查询结果
        clearScriptResult();
        
        // 显示成功提示
        const applyBtn = document.getElementById('apply-modifications-btn');
        if (applyBtn) {
            const originalHTML = applyBtn.innerHTML;
            applyBtn.innerHTML = '<i class="fas fa-check"></i> 已应用';
            applyBtn.disabled = true;
            
            setTimeout(() => {
                applyBtn.innerHTML = originalHTML;
                applyBtn.disabled = false;
                applyBtn.style.display = 'none';
            }, 2000);
        }
        
        alert('更新已成功应用到数据表');
        
    } catch (error) {
        console.error('应用更新失败:', error);
        alert('应用更新失败: ' + error.message);
    }
}

// 保存预览脚本到schema
async function savePreviewScript(autoSave = false, event = null) {
    if (!currentSchema || !currentSchemaName) {
        if (!autoSave) {
            alert('没有可用的 schema');
        }
        return;
    }
    
    const scriptEditor = window.scriptEditor;
    if (!scriptEditor) {
        // 编辑器未初始化,跳过保存
        return;
    }
    
    const scriptCode = scriptEditor.getValue();
    
    // 手动保存时检查是否为空
    if (!autoSave && !scriptCode.trim()) {
        alert('脚本内容为空');
        return;
    }
    
    try {
        // 更新 currentSchema 中的脚本字段
        currentSchema.script = scriptCode;
        
        // 保存到服务器
        const response = await fetch(API.SCHEMA, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'update',
                name: currentSchemaName,
                data: currentSchema
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            if (!autoSave) {
                // 手动保存时显示成功提示
                const saveBtn = event?.target;
                if (saveBtn) {
                    const originalHTML = saveBtn.innerHTML;
                    saveBtn.innerHTML = '<i class="fas fa-check"></i> 已保存';
                    saveBtn.disabled = true;
                    
                    setTimeout(() => {
                        saveBtn.innerHTML = originalHTML;
                        saveBtn.disabled = false;
                    }, 1500);
                } else {
                    alert('脚本已保存');
                }
            }
        } else {
            throw new Error(result.error || '保存失败');
        }
    } catch (error) {
        console.error('保存脚本失败:', error);
        if (!autoSave) {
            alert('保存脚本失败: ' + error.message);
        }
    }
}

function collectData() {
    const data = [];

    dataRows.forEach((dataRow, rowIndex) => {
        const rowData = {};
        const fields = currentSchema.fields || [];

        fields.forEach(field => {
            if (field.type === 'dict') {
                const selector = `.dict-container[data-row="${rowIndex}"][data-field="${field.name}"]`;
                const container = document.querySelector(selector);
                if (container) {
                    setFieldValue(rowData, field.name, collectDictDataFromContainer(container, field));
                } else {
                    setFieldValue(rowData, field.name, getFieldValue(dataRow.data, field.name) || {});
                }
            } else if (field.type === 'entry' || field.type === 'list') {
                const selector = field.type === 'entry' ?
                    `.entry-container[data-row="${rowIndex}"][data-field="${field.name}"]` :
                    `.list-container[data-row="${rowIndex}"][data-field="${field.name}"]`;
                const container = document.querySelector(selector);
                if (container) {
                    setFieldValue(rowData, field.name, field.type === 'entry' ? collectEntryDataFromContainer(container, field) : collectListDataFromContainer(container, field));
                } else {
                    setFieldValue(rowData, field.name, getFieldValue(dataRow.data, field.name) || []);
                }
            } else {
                const input = document.querySelector(`#field-${rowIndex}-${field.name}`);
                if (input) {
                    setFieldValue(rowData, field.name, input.value);
                } else {
                    setFieldValue(rowData, field.name, getFieldValue(dataRow.data, field.name) || '');
                }
            }
        });

        data.push(rowData);
    });

    return data;
}

function collectDictDataFromContainer(container, field) {
    const dict = {};
    const subfields = field.subfields || [];

    subfields.forEach(subfield => {
        const input = container.querySelector(`input[id*="${subfield.name}"], select[id*="${subfield.name}"]`);
        if (input) {
            // 使用工具函数设置字段值，如果字段名是纯数字则使用数字键
            setFieldValue(dict, subfield.name, input.value);
        }
    });

    return dict;
}

function collectEntryDataFromContainer(container, field) {
    const entries = [];
    const items = container.querySelectorAll('.entry-item');

    items.forEach(item => {
        const entry = {};
        const subfields = field.subfields || [];

        subfields.forEach(subfield => {
            const input = item.querySelector(`input[id*="${subfield.name}"], select[id*="${subfield.name}"]`);
            if (input) {
                // 使用工具函数设置字段值，如果字段名是纯数字则使用数字键
                setFieldValue(entry, subfield.name, input.value);
            }
        });

        entries.push(entry);
    });

    return entries;
}

// ========== Lua导出功能 ==========

// 存储require列表
let requireItems = [];

// 判断字符串是否为合法的Lua标识符
function isValidLuaIdentifier(str) {
    // Lua标识符规则: 字母或下划线开头,后面可以是字母、数字或下划线
    // 不能是Lua关键字
    const luaKeywords = [
        'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for',
        'function', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat',
        'return', 'then', 'true', 'until', 'while'
    ];
    
    if (!str || typeof str !== 'string') return false;
    if (luaKeywords.includes(str)) return false;
    
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(str);
}

function exportToLua() {
    const modal = document.getElementById('export-lua-modal');
    modal.classList.add('show');
    
    // 从当前schema加载导出配置
    if (currentSchema && currentSchema.exportConfig) {
        document.getElementById('export-namespace').value = currentSchema.exportConfig.namespace || 'Tile';
        document.getElementById('export-table-key-type').value = currentSchema.exportConfig.tableKeyType || 'string';
        requireItems = currentSchema.exportConfig.requires ? [...currentSchema.exportConfig.requires] : [];
    } else {
        document.getElementById('export-namespace').value = 'Tile';
        document.getElementById('export-table-key-type').value = 'string';
        requireItems = [];
    }
    
    renderRequireList();
    updateLuaExport();
    
    // 监听格式切换，显示/隐藏键类型配置
    document.getElementById('export-format-select').addEventListener('change', toggleTableKeyTypeVisibility);
    toggleTableKeyTypeVisibility();
    
    // 监听配置变化，自动保存到schema
    document.getElementById('export-namespace').addEventListener('blur', saveExportConfigToSchema);
    document.getElementById('export-table-key-type').addEventListener('blur', saveExportConfigToSchema);
}

function toggleTableKeyTypeVisibility() {
    const format = document.getElementById('export-format-select').value;
    const keyTypeGroup = document.getElementById('table-key-type-group');
    const requireListGroup = document.getElementById('require-list').parentElement;
    const namespaceGroup = document.getElementById('export-namespace').parentElement;
    
    // CSV格式隐藏Lua特有的配置项
    if (format === 'csv') {
        keyTypeGroup.style.display = 'none';
        requireListGroup.style.display = 'none';
        namespaceGroup.style.display = 'none';
    } else {
        keyTypeGroup.style.display = format === 'table' ? 'block' : 'none';
        requireListGroup.style.display = 'block';
        namespaceGroup.style.display = 'block';
    }
}

function saveExportConfigToSchema() {
    if (!currentSchema) return;
    
    if (!currentSchema.exportConfig) {
        currentSchema.exportConfig = {};
    }
    
    currentSchema.exportConfig.namespace = document.getElementById('export-namespace').value.trim() || 'Tile';
    currentSchema.exportConfig.tableKeyType = document.getElementById('export-table-key-type').value.trim() || 'string';
    currentSchema.exportConfig.requires = [...requireItems];
    
    // 自动保存到服务器
    saveSchemaExportConfig();
}

function addRequireItem() {
    requireItems.push({ varName: '', path: '' });
    renderRequireList();
    updateLuaExport();
    saveExportConfigToSchema();
}

function removeRequireItem(index) {
    requireItems.splice(index, 1);
    renderRequireList();
    updateLuaExport();
    saveExportConfigToSchema();
}

function renderRequireList() {
    const container = document.getElementById('require-list');
    if (requireItems.length === 0) {
        container.innerHTML = '<div style="color: #999; text-align: center; padding: 10px;">暂无包导入</div>';
        return;
    }
    
    container.innerHTML = requireItems.map((item, index) => `
        <div class="require-item">
            <input type="text" class="form-control var-name-input" 
                   placeholder="变量名" 
                   value="${escapeHtml(item.varName)}"
                   onchange="updateRequireItem(${index}, 'varName', this.value)">
            <input type="text" class="form-control path-input" 
                   placeholder="包路径 (例如: x.y.z)" 
                   value="${escapeHtml(item.path)}"
                   onchange="updateRequireItem(${index}, 'path', this.value)">
            <button type="button" class="btn btn-sm btn-danger btn-remove" onclick="removeRequireItem(${index})">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');
}

function updateRequireItem(index, field, value) {
    requireItems[index][field] = value;
    updateLuaExport();
    saveExportConfigToSchema();
}

function closeLuaExportModal() {
    const modal = document.getElementById('export-lua-modal');
    modal.classList.remove('show');
    
    // 关闭时再次保存（确保所有更改都已保存）
    saveExportConfigToSchema();
}

async function saveSchemaExportConfig() {
    if (!currentSchema || !currentSchemaName) return;
    
    try {
        await fetch(API.SCHEMA, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'update',
                name: currentSchemaName,
                data: currentSchema
            })
        });
    } catch (error) {
        console.error('保存导出配置错误:', error);
    }
}

function updateLuaExport() {
    const format = document.getElementById('export-format-select').value;
    const data = collectData();
    
    let code;
    if (format === 'csv') {
        code = generateCsvCode(data);
    } else {
        const namespace = document.getElementById('export-namespace').value.trim() || 'Tile';
        const tableKeyType = document.getElementById('export-table-key-type').value.trim() || 'string';
        code = generateLuaCode(data, format, namespace, tableKeyType);
    }
    
    document.getElementById('lua-code-output').textContent = code;
}

function generateLuaCode(data, format, namespace, tableKeyType) {
    const schema = currentSchema;
    const schemaName = currentSchemaName;
    
    let code = '';
    
    // 添加 namespace 注释头部
    code += `---@namespace ${namespace}\n\n`;
    
    // 添加包导入
    const validRequires = requireItems.filter(item => item.varName.trim() && item.path.trim());
    if (validRequires.length > 0) {
        validRequires.forEach(item => {
            code += `local ${item.varName} = require "${item.path}"\n`;
        });
        code += '\n';
    }
    
    // 如果schema有描述，添加描述注释
    if (schema.description) {
        code += `-- ${schema.description}\n\n`;
    }
    
    // 生成类型定义
    code += generateTypeDefinition(schema, schemaName);
    code += '\n';
    
    // 生成数据
    if (format === 'table') {
        code += generateLuaTable(data, schema, schemaName, tableKeyType);
    } else {
        code += generateLuaArray(data, schema, schemaName);
    }
    
    code += `\nreturn result\n`;
    
    return code;
}

function generateCsvCode(data) {
    const schema = currentSchema;
    const fields = schema.fields || [];
    
    // 第一列是固定的
    const headerRow1 = ['key'];
    const headerRow2 = ['Int'];
    
    // 添加所有字段的标签
    fields.forEach(field => {
        headerRow1.push(field.label || field.name);
        
        // 确定类型名称
        let typeName = getCsvType(field);
        headerRow2.push(typeName);
    });
    
    // 生成CSV行
    const csvRows = [];
    csvRows.push(headerRow1.join(','));
    csvRows.push(headerRow2.join(','));
    
    // 添加数据行
    dataRows.forEach((dataRow, rowIndex) => {
        const row = data[rowIndex];
        const csvRow = [(rowIndex + 1).toString()]; // key列是行号
        
        fields.forEach(field => {
            const value = getFieldValue(row, field.name);
            const csvValue = formatCsvValue(value, field);
            csvRow.push(csvValue);
        });
        
        csvRows.push(csvRow.join(','));
    });
    
    return csvRows.join('\n');
}

function getCsvType(field) {
    // 如果设置了自定义的 Lua 类型，优先使用
    if (field.luaType && field.luaType.trim()) {
        return field.luaType.trim();
    }
    
    switch (field.type) {
        case 'number':
            return 'Int';
        case 'text':
            return 'Str';
        case 'color':
            return 'ImageKey';
        case 'option':
            return 'Str';
        case 'datalist':
            return 'Str';
        case 'list':
            // 列表类型根据元素类型决定
            const elemType = field.elementType || 'text';
            if (elemType === 'number') {
                return 'ListInt';
            } else if (elemType === 'text' || elemType === 'option' || elemType === 'datalist') {
                return 'ListStr';
            } else {
                // 其他类型统一为ListBool（实际可能是boolean等）
                return 'ListBool';
            }
        case 'dict':
            return 'Entry'; // 字典和条目在CSV中都表示为Entry
        case 'entry':
            return 'Entry';
        case 'flags':
            return 'Int';
        default:
            return 'Str';
    }
}

function formatCsvValue(value, field) {
    if (value === null || value === undefined || value === '') {
        return '';
    }
    
    // 列表类型需要用[]包裹，模仿Python列表格式
    if (field.type === 'list' && Array.isArray(value)) {
        // 根据元素类型格式化
        const elemType = field.elementType || 'text';
        let formattedItems;
        
        if (elemType === 'number') {
            // 数字直接输出
            formattedItems = value.map(v => String(v));
        } else if (elemType === 'text' || elemType === 'option' || elemType === 'datalist') {
            // 字符串需要转义并加引号 (Python单引号风格不适用，CSV用双引号)
            formattedItems = value.map(v => {
                // CSV中的引号需要加倍转义
                const escaped = String(v).replace(/"/g, '""');
                return `"${escaped}"`;
            });
        } else {
            // 其他类型（如布尔值）使用Python格式: True/False
            formattedItems = value.map(v => {
                if (typeof v === 'boolean') {
                    return v ? 'True' : 'False';
                }
                return String(v);
            });
        }
        
        // 整个列表用引号包裹（因为包含逗号），内容用Python列表风格
        return `"[${formattedItems.join(', ')}]"`;
    }
    
    // dict类型转换为JSON字符串（单个对象）
    if (field.type === 'dict' && value && typeof value === 'object' && !Array.isArray(value)) {
        // 生成紧凑的JSON字符串
        const jsonStr = JSON.stringify(value);
        // CSV中的引号需要双倍转义
        return `"${jsonStr.replace(/"/g, '""')}"`;
    }
    
    // entry类型转换为JSON字符串（紧凑格式，无空格）
    if (field.type === 'entry' && Array.isArray(value)) {
        // 生成紧凑的JSON字符串
        const jsonStr = JSON.stringify(value);
        // CSV中的引号需要双倍转义
        return `"${jsonStr.replace(/"/g, '""')}"`;
    }
    
    // 数字类型直接输出
    if (field.type === 'number' || field.type === 'flags') {
        return String(value);
    }
    
    // 颜色类型作为ImageKey输出（数字）
    if (field.type === 'color') {
        // 移除0x前缀，转换为十进制数字
        const hex = String(value).replace(/^0x/i, '');
        const decimal = parseInt(hex, 16);
        return isNaN(decimal) ? '0' : String(decimal);
    }
    
    // 字符串类型
    const str = String(value);
    // 如果包含逗号、换行或引号，需要用引号包裹并转义
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    
    return str;
}

function generateTypeDefinition(schema, schemaName) {
    let code = '';
    const mainTypeName = toPascalCase(schemaName);
    
    // 先生成所有 dict 和 entry 类型的子类定义
    const fields = schema.fields || [];
    fields.forEach(field => {
        if (field.type === 'dict' && field.subfields && field.subfields.length > 0) {
            // 如果设置了自定义 luaType，使用它；否则使用字段名生成
            const dictTypeName = (field.luaType && field.luaType.trim()) 
                ? field.luaType.trim()
                : toPascalCase(field.name);
            code += `---@class (exact) ${dictTypeName}\n`;
            field.subfields.forEach(subfield => {
                const subfieldType = getLuaType(subfield);
                const comment = subfield.label || subfield.name;
                // 如果字段名不是合法的 Lua 标识符（比如纯数字），使用 [fieldName] 格式
                const fieldName = isValidLuaIdentifier(subfield.name) ? subfield.name : `[${subfield.name}]`;
                // 非必填字段添加 ? 标记
                const optionalMark = subfield.required ? '' : '?';
                code += `---@field ${fieldName} ${subfieldType}${optionalMark} ${comment}\n`;
            });
            code += '\n';
        } else if (field.type === 'entry' && field.subfields && field.subfields.length > 0) {
            // 如果设置了自定义 luaType，使用它；否则使用字段名生成
            const entryTypeName = (field.luaType && field.luaType.trim()) 
                ? field.luaType.trim().replace(/\[\]$/, '') // 移除可能的 []
                : toPascalCase(field.name);
            code += `---@class (exact) ${entryTypeName}\n`;
            field.subfields.forEach(subfield => {
                const subfieldType = getLuaType(subfield);
                const comment = subfield.label || subfield.name;
                // 如果字段名不是合法的 Lua 标识符（比如纯数字），使用 [fieldName] 格式
                const fieldName = isValidLuaIdentifier(subfield.name) ? subfield.name : `[${subfield.name}]`;
                // 非必填字段添加 ? 标记
                const optionalMark = subfield.required ? '' : '?';
                code += `---@field ${fieldName} ${subfieldType}${optionalMark} ${comment}\n`;
            });
            code += '\n';
        }
    });
    
    // 然后生成主类定义
    code += `---@class (exact) ${mainTypeName}\n`;
    fields.forEach(field => {
        const fieldType = getLuaType(field, schemaName);
        const comment = field.label || field.name;
        // 如果字段名不是合法的 Lua 标识符（比如纯数字），使用 [fieldName] 格式
        const fieldName = isValidLuaIdentifier(field.name) ? field.name : `[${field.name}]`;
        // 非必填字段添加 ? 标记
        const optionalMark = field.required ? '' : '?';
        code += `---@field ${fieldName} ${fieldType}${optionalMark} ${comment}\n`;
    });
    
    return code;
}

function toPascalCase(str) {
    return str
        .split(/[_-]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
}

function getLuaType(field, parentName = '') {
    // 如果设置了自定义的 Lua 类型，优先使用
    if (field.luaType && field.luaType.trim()) {
        return field.luaType.trim();
    }
    
    switch (field.type) {
        case 'number':
            return 'integer';
        case 'text':
            return 'string';
        case 'color':
            return 'integer';
        case 'option':
            return 'string';
        case 'datalist':
            return 'string';
        case 'dict':
            // 对于字典类型，使用字段名生成类型名（单个对象，不是数组）
            if (field.luaType && field.luaType.trim()) {
                return field.luaType.trim();
            }
            if (field.name) {
                const dictTypeName = toPascalCase(field.name);
                return dictTypeName;
            }
            return 'table';
        case 'entry':
            // 对于条目类型，如果设置了 luaType 就直接使用（可能已包含[]），否则使用字段名生成
            if (field.luaType && field.luaType.trim()) {
                const customType = field.luaType.trim();
                // 如果自定义类型已经包含[]，直接返回；否则添加[]
                return customType.endsWith('[]') ? customType : `${customType}[]`;
            }
            // 没有自定义类型，使用字段名生成
            if (field.name) {
                const entryTypeName = toPascalCase(field.name);
                return `${entryTypeName}[]`;
            }
            return 'table[]';
        default:
            return 'any';
    }
}

function generateLuaTable(data, schema, schemaName, tableKeyType = 'string') {
    const typeName = toPascalCase(schemaName);
    let code = `---@type table<${tableKeyType}, ${typeName}>\nlocal result = {\n`;
    
    dataRows.forEach((dataRow, index) => {
        const row = data[index];
        // 使用数据行名称作为键
        const key = dataRow.name || `item_${index + 1}`;
        
        // 根据 isRaw 决定键的格式
        if (dataRow.isRaw) {
            code += `    [${key}] = {\n`;
        } else {
            code += `    ["${escapeHtml(key)}"] = {\n`;
        }
        
        code += generateLuaFields(row, schema, '        ');
        code += `    }`;
        
        if (index < data.length - 1) {
            code += ',';
        }
        code += '\n';
    });
    
    code += `}`;
    
    return code;
}

function generateLuaArray(data, schema, schemaName) {
    const typeName = toPascalCase(schemaName);
    let code = `---@type ${typeName}[]\nlocal result = {\n`;
    
    data.forEach((row, index) => {
        code += `    {\n`;
        code += generateLuaFields(row, schema, '        ');
        code += `    }`;
        
        if (index < data.length - 1) {
            code += ',';
        }
        code += '\n';
    });
    
    code += `}`;
    
    return code;
}

function generateLuaFields(row, schema, indent) {
    let code = '';
    const fields = schema.fields || [];
    
    fields.forEach((field, fieldIndex) => {
        // 使用工具函数获取字段值，支持数字键
        const value = getFieldValue(row, field.name);
        
        // 智能选择字段名格式
        if (isValidLuaIdentifier(field.name)) {
            // 合法的 Lua 标识符，直接使用
            code += `${indent}${field.name} = `;
        } else if (/^\d+$/.test(field.name)) {
            // 纯数字，使用 [number] 格式（不带引号）
            code += `${indent}[${field.name}] = `;
        } else {
            // 其他情况，使用 ["string"] 格式
            code += `${indent}["${field.name}"] = `;
        }
        
        if (field.type === 'dict' && value && typeof value === 'object' && !Array.isArray(value)) {
            // 字典类型导出为单个对象
            code += formatLuaEntry(value, field);
        } else if (field.type === 'entry' && Array.isArray(value)) {
            code += '{\n';
            value.forEach((entry, entryIndex) => {
                code += `${indent}    `;
                code += formatLuaEntry(entry, field);
                if (entryIndex < value.length - 1) {
                    code += ',';
                }
                code += '\n';
            });
            code += `${indent}}`;
        } else if (field.type === 'list' && Array.isArray(value)) {
            // 导出列表为Lua数组，元素按 field.elementType 处理
            const elemType = field.elementType || 'text';
            code += '{ ';
            const parts = value.map(v => formatLuaValue(v, elemType, field.isRaw));
            code += parts.join(', ');
            code += ' }';
        } else if (field.type === 'flags') {
            // 标志组合直接导出为数字
            code += formatLuaValue(value, 'number', false);
        } else {
            // 传递 isRaw 参数
            code += formatLuaValue(value, field.type, field.isRaw);
        }
        
        if (fieldIndex < fields.length - 1) {
            code += ',';
        }
        
        // 在行尾添加注释
        if (field.label && field.label !== field.name) {
            code += ` -- ${field.label}`;
        }
        
        code += '\n';
    });
    
    return code;
}

function formatLuaEntry(entry, field) {
    const subfields = field.subfields || [];
    let parts = [];
    
    subfields.forEach(subfield => {
        // 使用工具函数获取字段值，支持数字键
        const value = getFieldValue(entry, subfield.name);
        const luaValue = formatLuaValue(value, subfield.type, subfield.isRaw);
        
        // 智能选择字段名格式
        if (isValidLuaIdentifier(subfield.name)) {
            // 合法的 Lua 标识符，直接使用
            parts.push(`${subfield.name} = ${luaValue}`);
        } else if (/^\d+$/.test(subfield.name)) {
            // 纯数字，使用 [number] 格式（不带引号）
            parts.push(`[${subfield.name}] = ${luaValue}`);
        } else {
            // 其他情况，使用 ["string"] 格式
            parts.push(`["${subfield.name}"] = ${luaValue}`);
        }
    });
    
    return `{ ${parts.join(', ')} }`;
}

function formatLuaValue(value, type, isRaw = false) {
    if (value === null || value === undefined || value === '') {
        return 'nil';
    }
    
    switch (type) {
        case 'number':
            return String(value);
        
        case 'color':
            // 颜色值确保以 0x 开头
            const colorStr = String(value).toUpperCase();
            // 移除可能的 # 或 0x 前缀
            const hexOnly = colorStr.replace(/^(0x|#)/i, '');
            // 确保是6位十六进制数
            if (/^[0-9A-F]{6}$/.test(hexOnly)) {
                return '0x' + hexOnly;
            }
            // 如果格式不对，返回原值
            return colorStr.startsWith('0x') ? colorStr : '0x' + colorStr;
        
        case 'text':
        case 'option':
        case 'datalist':
            // 如果标记为原始文本，直接输出不加引号
            if (isRaw) {
                return String(value);
            }
            return formatLuaString(String(value));
        
        default:
            // 检查是否是数字
            if (!isNaN(value) && value !== '') {
                return String(value);
            }
            return formatLuaString(String(value));
    }
}

function formatLuaString(str) {
    // 检查是否需要使用双引号
    if (str.includes('"')) {
        return `'${str.replace(/'/g, "\\'")}'`;
    }
    return `"${str}"`;
}

function formatLuaKey(key) {
    // 如果key看起来像一个枚举值或变量，直接使用
    // 例如: FishCode.Clownfish, AreaCode.Ocean
    if (/^[A-Z][a-zA-Z0-9]*\.[A-Z][a-zA-Z0-9]*$/.test(key)) {
        return key;
    }
    
    // 如果key是有效的Lua标识符，直接使用
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        return key;
    }
    
    // 否则使用字符串形式
    return formatLuaString(key);
}

async function copyLuaCode() {
    const codeElement = document.getElementById('lua-code-output');
    const code = codeElement.textContent;
    
    try {
        await navigator.clipboard.writeText(code);
        
        // 显示复制成功提示
        const btn = document.getElementById('copy-lua-btn');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> 已复制';
        btn.disabled = true;
        
        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }, 2000);
    } catch (error) {
        console.error('复制失败:', error);
        
        // 降级方案：使用传统方法
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

function downloadExportFile() {
    const codeElement = document.getElementById('lua-code-output');
    const code = codeElement.textContent;
    const format = document.getElementById('export-format-select').value;
    
    // 确定文件名和扩展名
    let fileName = currentSchemaName || 'export';
    let extension, mimeType;
    
    if (format === 'csv') {
        extension = 'csv';
        mimeType = 'text/csv;charset=utf-8;';
    } else {
        extension = 'lua';
        mimeType = 'text/plain;charset=utf-8;';
    }
    
    // 创建Blob并下载
    const blob = new Blob([code], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}.${extension}`;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // 释放URL对象
    setTimeout(() => URL.revokeObjectURL(url), 100);
    
    // 显示下载成功提示
    const btn = document.getElementById('download-export-btn');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> 已下载';
    btn.disabled = true;
    
    setTimeout(() => {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }, 2000);
}

function downloadPreviewCsv() {
    // 从预览表格生成CSV
    const data = collectData();
    const csvCode = generateCsvCode(data);
    
    // 确定文件名
    const fileName = currentSchemaName || 'preview';
    
    // 创建Blob并下载
    const blob = new Blob([csvCode], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}_preview.csv`;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // 释放URL对象
    setTimeout(() => URL.revokeObjectURL(url), 100);
    
    // 显示下载成功提示
    const btn = document.getElementById('download-preview-btn');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> 已下载';
    btn.disabled = true;
    
    setTimeout(() => {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }, 2000);
}

// ========== 标志组合模态框 ==========

let currentFlagsRowIndex = -1;
let currentFlagsFieldName = '';
let currentFlagsEnum = null;

async function openFlagsModal(rowIndex, fieldName, initialValue) {
    if (!currentSchema || !currentSchema.fields) return;
    
    const field = currentSchema.fields.find(f => f.name === fieldName);
    if (!field || field.type !== 'flags' || !field.dataSource || !field.dataSource.enum) {
        alert('标志字段配置错误');
        return;
    }
    
    currentFlagsRowIndex = rowIndex;
    currentFlagsFieldName = fieldName;
    
    // 从输入框读取当前实际值，而不是使用传入的初始值
    const fieldId = `field-${rowIndex}-${fieldName}`;
    const input = document.getElementById(fieldId);
    const currentValue = input ? parseInt(input.value) || 0 : (initialValue || 0);
    
    // 加载枚举数据
    try {
        const response = await fetch(`${API.ENUM}?action=get&name=${encodeURIComponent(field.dataSource.enum)}`);
        const result = await response.json();
        
        if (!result.success || !result.data) {
            alert('加载枚举数据失败');
            return;
        }
        
        currentFlagsEnum = result.data;
        
        // 渲染复选框列表
        const container = document.getElementById('flags-checkboxes');
        container.innerHTML = currentFlagsEnum.values.map(v => {
            const bitValue = 1 << v.value; // 将位偏移转换为实际标志位值
            const isChecked = (currentValue & bitValue) === bitValue;
            return `
                <label class="flags-checkbox-item">
                    <input type="checkbox" 
                           data-bit-offset="${v.value}"
                           ${isChecked ? 'checked' : ''}
                           onchange="updateFlagsValue()">
                    <span>${v.label || v.key} (1 << ${v.value} = ${bitValue})</span>
                </label>
            `;
        }).join('');
        
        // 更新结果值
        updateFlagsValue();
        
        // 显示模态框
        document.getElementById('flags-modal').style.display = 'flex';
    } catch (error) {
        console.error('加载标志枚举失败:', error);
        alert('加载标志枚举失败');
    }
}

function updateFlagsValue() {
    const checkboxes = document.querySelectorAll('#flags-checkboxes input[type="checkbox"]:checked');
    let total = 0;
    checkboxes.forEach(cb => {
        const bitOffset = parseInt(cb.getAttribute('data-bit-offset'));
        total |= (1 << bitOffset); // 使用位移操作计算标志位值
    });
    document.getElementById('flags-result-value').value = total;
}

function confirmFlagsSelection() {
    const value = parseInt(document.getElementById('flags-result-value').value) || 0;
    const fieldId = `field-${currentFlagsRowIndex}-${currentFlagsFieldName}`;
    const input = document.getElementById(fieldId);
    if (input) {
        input.value = value;
    }
    closeFlagsModal();
}

function closeFlagsModal() {
    document.getElementById('flags-modal').style.display = 'none';
    currentFlagsRowIndex = -1;
    currentFlagsFieldName = '';
    currentFlagsEnum = null;
}

// ========== 导入数据功能 ==========

let importedData = null;

function openImportDataModal() {
    if (!currentSchema) {
        alert('请先选择一个Schema');
        return;
    }
    
    document.getElementById('import-data-modal').classList.add('show');
    document.getElementById('import-file-input').value = '';
    document.getElementById('import-preview').style.display = 'none';
    document.getElementById('confirm-import-btn').disabled = true;
    importedData = null;
}

function closeImportDataModal() {
    document.getElementById('import-data-modal').classList.remove('show');
    importedData = null;
}

// 监听文件选择
function onImportFileSelected(event) {
    const file = event.target.files[0];
    if (!file) {
        document.getElementById('import-preview').style.display = 'none';
        document.getElementById('confirm-import-btn').disabled = true;
        return;
    }
    
    const fileType = document.getElementById('import-file-type').value;
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const content = e.target.result;
        try {
            if (fileType === 'csv') {
                importedData = parseCSVImport(content);
            } else {
                importedData = parseLuaImport(content);
            }
            
            if (importedData && importedData.length > 0) {
                showImportPreview(importedData);
                document.getElementById('confirm-import-btn').disabled = false;
            } else {
                showImportError('未能解析到有效数据');
                document.getElementById('confirm-import-btn').disabled = true;
            }
        } catch (error) {
            console.error('解析文件失败:', error);
            showImportError('文件解析失败: ' + error.message);
            document.getElementById('confirm-import-btn').disabled = true;
        }
    };
    
    reader.readAsText(file, 'UTF-8');
}

// 解析CSV导入（蛋仔表格格式）
function parseCSVImport(content) {
    const lines = content.trim().split('\n');
    if (lines.length < 3) {
        throw new Error('CSV文件格式不正确，至少需要3行（标题、类型、数据）');
    }
    
    // 解析CSV行（处理引号包裹的字段）
    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];
            
            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // 双引号转义
                    current += '"';
                    i++;
                } else {
                    // 切换引号状态
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                // 字段分隔符
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    }
    
    // 第一行：key + 字段标签
    const headers = parseCSVLine(lines[0]);
    headers.shift(); // 移除 "key" 列
    
    // 第二行：Int + 字段类型（暂不使用，以schema为准）
    // const types = parseCSVLine(lines[1]);
    
    // 解析数据行
    const dataRows = [];
    for (let i = 2; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const values = parseCSVLine(lines[i]);
        const rowKey = values[0]; // 行号或key
        
        const rowData = {
            name: `row_${rowKey}`,
            isRaw: false,
            data: {}
        };
        
        // 根据schema字段匹配数据
        currentSchema.fields.forEach((field, fieldIndex) => {
            const value = values[fieldIndex + 1]; // +1 因为第一列是key
            if (value !== undefined && value !== '') {
                const parsedValue = parseCSVValue(value, field);
                setFieldValue(rowData.data, field.name, parsedValue);
            }
        });
        
        dataRows.push(rowData);
    }
    
    return dataRows;
}

// 解析CSV值根据字段类型
function parseCSVValue(value, field) {
    if (value === '' || value === null || value === undefined) {
        return '';
    }
    
    switch (field.type) {
        case 'number':
        case 'flags':
            return String(parseInt(value) || 0);
        
        case 'color':
            // CSV中是十进制数字，转换为十六进制
            const decimal = parseInt(value);
            if (!isNaN(decimal)) {
                return '0x' + decimal.toString(16).toUpperCase().padStart(6, '0');
            }
            return value;
        
        case 'list':
            // 解析 "[元素1, 元素2, ...]" 格式
            if (value.startsWith('[') && value.endsWith(']')) {
                const listContent = value.slice(1, -1).trim();
                if (!listContent) return [];
                
                // 简单分割（处理引号包裹的元素）
                const elements = [];
                let current = '';
                let inQuotes = false;
                
                for (let i = 0; i < listContent.length; i++) {
                    const char = listContent[i];
                    
                    if (char === '"' && listContent[i - 1] !== '\\') {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        elements.push(current.trim().replace(/^"|"$/g, ''));
                        current = '';
                    } else {
                        current += char;
                    }
                }
                if (current.trim()) {
                    elements.push(current.trim().replace(/^"|"$/g, ''));
                }
                
                // 根据elementType转换
                if (field.elementType === 'number') {
                    return elements.map(e => String(parseInt(e) || 0));
                }
                return elements.map(e => String(e));
            }
            return [];
        
        case 'dict':
            // 解析JSON字符串（单个对象）
            try {
                const parsed = JSON.parse(value);
                return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
            } catch {
                return {};
            }
        
        case 'entry':
            // 解析JSON字符串
            try {
                return JSON.parse(value);
            } catch {
                return [];
            }
        
        default:
            return String(value);
    }
}

// 解析Lua导入（Table和Array格式）
function parseLuaImport(content) {
    // 移除注释
    const withoutComments = content.replace(/--.*$/gm, '');
    
    // 查找主table
    let tableMatch = withoutComments.match(/local\s+result\s*=\s*(\{[\s\S]*\})\s*return\s+result/);
    if (!tableMatch) {
        tableMatch = withoutComments.match(/return\s+(\{[\s\S]*\})/);
    }
    
    if (!tableMatch) {
        throw new Error('未找到Lua table结构');
    }
    
    const tableContent = tableMatch[1];
    
    // 判断是Table格式还是Array格式
    // Table格式有键值对: ["key"] = { ... } 或 [key] = { ... }
    // Array格式只有值: { ... }, { ... }
    const isTableFormat = /\[[^\]]+\]\s*=\s*\{/.test(tableContent);
    
    if (isTableFormat) {
        return parseLuaTableFormat(tableContent);
    } else {
        return parseLuaArrayFormat(tableContent);
    }
}

// 解析Table格式: ["key"] = { fields... }
function parseLuaTableFormat(tableContent) {
    const dataRows = [];
    
    // 使用栈来匹配嵌套的大括号
    let depth = 0;
    let currentEntry = '';
    let currentKey = '';
    let inKey = false;
    let i = 0;
    
    while (i < tableContent.length) {
        const char = tableContent[i];
        
        // 查找键
        if (char === '[' && depth === 1) {
            inKey = true;
            let keyEnd = i + 1;
            while (keyEnd < tableContent.length && tableContent[keyEnd] !== ']') {
                keyEnd++;
            }
            currentKey = tableContent.substring(i + 1, keyEnd).replace(/['"]/g, '').trim();
            i = keyEnd + 1;
            
            // 跳过 = 号
            while (i < tableContent.length && /[\s=]/.test(tableContent[i])) {
                i++;
            }
            continue;
        }
        
        if (char === '{') {
            depth++;
            if (depth === 2 && currentKey) {
                currentEntry = '';
            } else if (depth > 2) {
                // 嵌套的大括号也要累积到entry内容中
                currentEntry += char;
            }
        } else if (char === '}') {
            if (depth > 2) {
                // 嵌套大括号的结束也要累积
                currentEntry += char;
            }
            depth--;
            if (depth === 1 && currentKey) {
                // 解析完成一个entry
                const rowData = parseLuaEntry(currentKey, currentEntry, tableContent.substring(i - currentEntry.length - 1, i + 1));
                if (rowData) {
                    dataRows.push(rowData);
                }
                currentKey = '';
                currentEntry = '';
            }
        } else if (depth >= 2) {
            // 只要在entry内部（depth >= 2），都累积内容
            currentEntry += char;
        }
        
        i++;
    }
    
    return dataRows;
}

// 解析Array格式: { { fields... }, { fields... } }
function parseLuaArrayFormat(tableContent) {
    const dataRows = [];
    
    // 使用栈来匹配嵌套的大括号
    let depth = 0;
    let currentEntry = '';
    let entryIndex = 0;
    
    for (let i = 0; i < tableContent.length; i++) {
        const char = tableContent[i];
        
        if (char === '{') {
            depth++;
            if (depth === 2) {
                currentEntry = '';
            } else if (depth > 2) {
                // 嵌套的大括号也要累积到entry内容中
                currentEntry += char;
            }
        } else if (char === '}') {
            if (depth > 2) {
                // 嵌套大括号的结束也要累积
                currentEntry += char;
            }
            depth--;
            if (depth === 1 && currentEntry.trim()) {
                // 解析完成一个entry
                const rowData = parseLuaEntry(`row_${entryIndex + 1}`, currentEntry, null);
                if (rowData) {
                    dataRows.push(rowData);
                    entryIndex++;
                }
                currentEntry = '';
            }
        } else if (depth >= 2) {
            // 只要在entry内部（depth >= 2），都累积内容
            currentEntry += char;
        }
    }
    
    return dataRows;
}

// 解析单个Lua entry
function parseLuaEntry(key, entryContent, fullEntry) {
    const rowData = {
        name: key,
        isRaw: false, // 默认不是原始文本
        data: {}
    };
    
    // 如果有完整entry，检查key是否有引号来判断isRaw
    if (fullEntry) {
        const keyMatch = fullEntry.match(/\[([^\]]+)\]/);
        if (keyMatch) {
            rowData.isRaw = !/['"]/.test(keyMatch[1]);
        }
    }
    
    // 解析entry中的字段
    currentSchema.fields.forEach(field => {
        const value = extractLuaFieldValue(entryContent, field.name);
        if (value !== null) {
            const parsedValue = parseLuaValue(value, field);
            setFieldValue(rowData.data, field.name, parsedValue);
        }
    });
    
    return rowData;
}

// 从Lua entry内容中提取字段值
function extractLuaFieldValue(entryContent, fieldName) {
    // 转义字段名中的特殊字符
    const escapedFieldName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 尝试多种匹配模式
    const patterns = [
        // fieldName = value
        new RegExp(`\\b${escapedFieldName}\\s*=\\s*`, 'i'),
        // ["fieldName"] = value
        new RegExp(`\\["${escapedFieldName}"\\]\\s*=\\s*`, 'i'),
        // [fieldName] = value
        new RegExp(`\\[${escapedFieldName}\\]\\s*=\\s*`, 'i')
    ];
    
    for (const pattern of patterns) {
        const match = pattern.exec(entryContent);
        if (match) {
            const startPos = match.index + match[0].length;
            let remainingContent = entryContent.substring(startPos);
            
            // 如果值以 { 开始，需要找到匹配的 }
            if (remainingContent.trim().startsWith('{')) {
                let depth = 0;
                let endPos = 0;
                let inString = false;
                let stringChar = '';
                
                for (let i = 0; i < remainingContent.length; i++) {
                    const char = remainingContent[i];
                    
                    // 检查字符串
                    if ((char === '"' || char === "'") && (i === 0 || remainingContent[i - 1] !== '\\')) {
                        if (!inString) {
                            inString = true;
                            stringChar = char;
                        } else if (char === stringChar) {
                            inString = false;
                        }
                    }
                    
                    if (!inString) {
                        if (char === '{') depth++;
                        if (char === '}') {
                            depth--;
                            if (depth === 0) {
                                endPos = i + 1;
                                break;
                            }
                        }
                    }
                }
                
                if (endPos > 0) {
                    return remainingContent.substring(0, endPos).trim();
                }
            } else {
                // 非大括号的值，找到下一个字段或结束
                let endPos = remainingContent.length;
                let inString = false;
                let stringChar = '';
                
                for (let i = 0; i < remainingContent.length; i++) {
                    const char = remainingContent[i];
                    const nextChar = i < remainingContent.length - 1 ? remainingContent[i + 1] : '';
                    
                    // 检查字符串
                    if ((char === '"' || char === "'") && (i === 0 || remainingContent[i - 1] !== '\\')) {
                        if (!inString) {
                            inString = true;
                            stringChar = char;
                        } else if (char === stringChar) {
                            inString = false;
                        }
                    }
                    
                    if (!inString) {
                        // 遇到逗号
                        if (char === ',') {
                            endPos = i;
                            break;
                        }
                        // 遇到注释
                        if (char === '-' && nextChar === '-') {
                            endPos = i;
                            break;
                        }
                        // 遇到换行后是新字段（下一行）
                        if (char === '\n') {
                            const afterNewline = remainingContent.substring(i + 1).trim();
                            if (/^\w+\s*=/.test(afterNewline) || afterNewline.startsWith('}')) {
                                endPos = i;
                                break;
                            }
                        }
                    }
                }
                
                return remainingContent.substring(0, endPos).trim().replace(/,\s*$/, '');
            }
        }
    }
    
    return null;
}

// 解析Lua值根据字段类型
function parseLuaValue(value, field) {
    if (!value || value === 'nil') {
        return field.type === 'list' || field.type === 'entry' ? [] : (field.type === 'dict' ? {} : '');
    }
    
    value = value.trim();
    
    switch (field.type) {
        case 'number':
        case 'flags':
            return String(parseInt(value) || 0);
        
        case 'color':
            // 保持十六进制格式
            if (value.startsWith('0x') || value.startsWith('0X')) {
                return value.toUpperCase();
            }
            return value;
        
        case 'list':
            // 解析 { 元素1, 元素2, ... } 格式
            if (value.startsWith('{') && value.endsWith('}')) {
                const listContent = value.slice(1, -1).trim();
                if (!listContent) return [];
                
                // 智能分割（处理嵌套的大括号和引号）
                const elements = smartSplitLuaList(listContent);
                
                return elements.map(e => {
                    e = e.trim();
                    // 移除引号
                    if ((e.startsWith('"') && e.endsWith('"')) || 
                        (e.startsWith("'") && e.endsWith("'"))) {
                        return e.slice(1, -1);
                    }
                    return e;
                });
            }
            return [];
        
        case 'dict':
            // 解析单个对象: { field1 = val1, field2 = val2 }
            if (value.startsWith('{') && value.endsWith('}')) {
                const dictContent = value.slice(1, -1).trim();
                
                // 空对象 {}
                if (!dictContent) return {};
                
                const dictObj = {};
                
                // 解析dict的subfields
                if (field.subfields && field.subfields.length > 0) {
                    field.subfields.forEach(subfield => {
                        const subfieldValue = extractLuaFieldValue(dictContent, subfield.name);
                        if (subfieldValue !== null) {
                            const parsedValue = parseLuaValue(subfieldValue, subfield);
                            setFieldValue(dictObj, subfield.name, parsedValue);
                        }
                    });
                }
                
                return dictObj;
            }
            return {};
        
        case 'entry':
            // 解析嵌套table: { { field1 = val1, field2 = val2 }, ... } 或单个 {}
            if (value.startsWith('{') && value.endsWith('}')) {
                const listContent = value.slice(1, -1).trim();
                
                // 空对象 {} 返回空数组
                if (!listContent) return [];
                
                // 检查是否是单层对象（直接包含字段，不是数组）
                // 如: { field1 = val1, field2 = val2 } 而不是 { { ... }, { ... } }
                const isSingleEntry = !listContent.trim().startsWith('{');
                
                if (isSingleEntry) {
                    // 单个entry对象
                    const entryObj = {};
                    
                    if (field.subfields && field.subfields.length > 0) {
                        field.subfields.forEach(subfield => {
                            const subfieldValue = extractLuaFieldValue(listContent, subfield.name);
                            if (subfieldValue !== null) {
                                const parsedValue = parseLuaValue(subfieldValue, subfield);
                                setFieldValue(entryObj, subfield.name, parsedValue);
                            }
                        });
                    }
                    
                    return [entryObj];
                } else {
                    // 多个entry对象的数组
                    const entries = smartSplitLuaList(listContent);
                    const result = [];
                    
                    entries.forEach(entryStr => {
                        entryStr = entryStr.trim();
                        if (entryStr.startsWith('{') && entryStr.endsWith('}')) {
                            const entryContent = entryStr.slice(1, -1);
                            const entryObj = {};
                            
                            // 解析entry的subfields
                            if (field.subfields && field.subfields.length > 0) {
                                field.subfields.forEach(subfield => {
                                    const subfieldValue = extractLuaFieldValue(entryContent, subfield.name);
                                    if (subfieldValue !== null) {
                                        // 递归解析subfield的值
                                        const parsedValue = parseLuaValue(subfieldValue, subfield);
                                        setFieldValue(entryObj, subfield.name, parsedValue);
                                    }
                                });
                            }
                            
                            result.push(entryObj);
                        }
                    });
                    
                    return result;
                }
            }
            return [];
        
        case 'text':
        case 'option':
        case 'datalist':
            // 移除引号
            if ((value.startsWith('"') && value.endsWith('"')) || 
                (value.startsWith("'") && value.endsWith("'"))) {
                return value.slice(1, -1);
            }
            return value;
        
        default:
            return String(value);
    }
}

// 智能分割Lua列表（处理嵌套结构）
function smartSplitLuaList(content) {
    const elements = [];
    let current = '';
    let depth = 0;
    let inString = false;
    let stringChar = '';
    let inComment = false;
    
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const prevChar = i > 0 ? content[i - 1] : '';
        const nextChar = i < content.length - 1 ? content[i + 1] : '';
        
        // 处理注释
        if (char === '-' && nextChar === '-' && !inString) {
            inComment = true;
        }
        if (inComment) {
            if (char === '\n') {
                inComment = false;
            }
            current += char;
            continue;
        }
        
        // 处理字符串
        if ((char === '"' || char === "'") && prevChar !== '\\') {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                inString = false;
            }
        }
        
        if (!inString) {
            if (char === '{') {
                depth++;
            } else if (char === '}') {
                depth--;
            } else if (char === ',' && depth === 0) {
                const trimmed = current.trim();
                // 移除注释
                const withoutComment = trimmed.replace(/\s*--.*$/, '').trim();
                if (withoutComment) {
                    elements.push(withoutComment);
                }
                current = '';
                continue;
            }
        }
        
        current += char;
    }
    
    const trimmed = current.trim();
    // 移除注释
    const withoutComment = trimmed.replace(/\s*--.*$/, '').trim();
    if (withoutComment) {
        elements.push(withoutComment);
    }
    
    return elements;
}

// 显示导入预览
function showImportPreview(data) {
    const previewDiv = document.getElementById('import-preview');
    const contentDiv = document.getElementById('import-preview-content');
    
    let html = `<div class="import-preview-stats">
        准备导入 ${data.length} 行数据
    </div>`;
    
    // 显示前5行的预览
    html += '<table class="import-preview-table">';
    html += '<thead><tr><th>数据行名称</th>';
    
    currentSchema.fields.forEach(field => {
        html += `<th>${escapeHtml(field.label || field.name)}</th>`;
    });
    html += '</tr></thead><tbody>';
    
    const previewCount = Math.min(5, data.length);
    for (let i = 0; i < previewCount; i++) {
        const row = data[i];
        html += `<tr><td>${escapeHtml(row.name)}</td>`;
        
        currentSchema.fields.forEach(field => {
            let value = getFieldValue(row.data, field.name);
            if (Array.isArray(value)) {
                value = `[${value.length}项]`;
            } else if (value === '' || value === null || value === undefined) {
                value = '<em>空</em>';
            }
            html += `<td>${escapeHtml(String(value))}</td>`;
        });
        
        html += '</tr>';
    }
    
    html += '</tbody></table>';
    
    if (data.length > 5) {
        html += `<p style="text-align: center; color: #666; margin-top: 10px;">... 还有 ${data.length - 5} 行数据</p>`;
    }
    
    contentDiv.innerHTML = html;
    previewDiv.style.display = 'block';
}

// 显示导入错误
function showImportError(message) {
    const previewDiv = document.getElementById('import-preview');
    const contentDiv = document.getElementById('import-preview-content');
    
    contentDiv.innerHTML = `<div class="import-preview-error">
        <i class="fas fa-exclamation-triangle"></i> ${escapeHtml(message)}
    </div>`;
    
    previewDiv.style.display = 'block';
}

// 导入文件类型变化时更新文件选择器
function onImportFileTypeChange() {
    const fileTypeSelect = document.getElementById('import-file-type');
    const fileInput = document.getElementById('import-file-input');
    const previewDiv = document.getElementById('import-preview');
    
    // 清空已选择的文件和预览
    fileInput.value = '';
    previewDiv.style.display = 'none';
    importedData = null;
    
    // 根据选择的类型设置accept属性
    if (fileTypeSelect.value === 'csv') {
        fileInput.accept = '.csv';
    } else if (fileTypeSelect.value === 'lua') {
        fileInput.accept = '.lua,.txt';
    }
}

// 确认导入
function confirmImport() {
    if (!importedData || importedData.length === 0) {
        alert('没有可导入的数据');
        return;
    }
    
    const clearExisting = document.getElementById('import-clear-existing').checked;
    
    if (clearExisting) {
        // 清空现有数据
        dataRows = [...importedData];
    } else {
        // 追加数据
        dataRows = dataRows.concat(importedData);
    }
    
    // 刷新界面
    renderDataRowsList();
    
    // 显示导入的第一行
    if (dataRows.length > 0) {
        selectedDataRowIndex = 0;
        renderDataRowEditor(0);
    }
    
    // 关闭模态框
    closeImportDataModal();
    
    alert(`成功导入 ${importedData.length} 行数据`);
}

// ==================== 代码编辑器初始化 ====================

let scriptEditor = null;

function initScriptEditor() {
    // 如果已经初始化过，直接返回
    if (scriptEditor) {
        return;
    }
    
    const textarea = document.getElementById('preview-script-input');
    if (!textarea || typeof CodeMirror === 'undefined') {
        return;
    }
    
    // 创建自定义字段补全函数
    CodeMirror.registerHelper('hint', 'dataFields', function(editor, options) {
        const cur = editor.getCursor();
        const line = editor.getLine(cur.line);
        
        // 检测是否在 data. 或 source[index]. 后面
        const beforeCursor = line.substring(0, cur.ch);
        const dataMatch = beforeCursor.match(/(?:data|source(?:\[\d+\])?)\.(\w*)$/);
        
        if (!dataMatch || !window.previewSchemaCache) {
            return null;
        }
        
        const prefix = dataMatch[1] || '';
        const fields = window.previewSchemaCache.fields || [];
        
        // 获取所有字段名和标签
        const suggestions = fields.map(field => ({
            text: field.name,
            displayText: `${field.name} - ${field.label || field.name} (${field.type})`
        }));
        
        // 过滤匹配前缀的字段
        const filtered = prefix ? 
            suggestions.filter(s => s.text.toLowerCase().startsWith(prefix.toLowerCase())) :
            suggestions;
        
        if (filtered.length === 0) {
            return null;
        }
        
        return {
            list: filtered,
            from: CodeMirror.Pos(cur.line, cur.ch - prefix.length),
            to: CodeMirror.Pos(cur.line, cur.ch)
        };
    });
    
    // 创建 CodeMirror 编辑器
    scriptEditor = CodeMirror.fromTextArea(textarea, {
        mode: 'javascript',
        theme: 'monokai',
        lineNumbers: true,
        lineWrapping: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        extraKeys: {
            'Ctrl-Enter': function(cm) {
                executeScript();
            },
            'Cmd-Enter': function(cm) {
                executeScript();
            },
            'Ctrl-Space': function(cm) {
                cm.showHint({ 
                    hint: CodeMirror.hint.dataFields, 
                    completeSingle: false 
                });
            }
        }
    });
    
    // 保存到全局 window 对象供其他函数使用
    window.scriptEditor = scriptEditor;
    
    // 设置编辑器高度自适应
    scriptEditor.setSize('100%', '100%');
    
    // 监听输入事件，自动触发补全
    scriptEditor.on('inputRead', function(cm, change) {
        if (change.text[0] === '.') {
            const cursor = cm.getCursor();
            const line = cm.getLine(cursor.line);
            const before = line.substring(0, cursor.ch);
            
            // 检测 data. 或 source. 或 source[n].
            if (/(?:data|source(?:\[\d+\])?)\.$/. test(before)) {
                setTimeout(function() {
                    cm.showHint({ 
                        hint: CodeMirror.hint.dataFields, 
                        completeSingle: false 
                    });
                }, 100);
            }
        }
    });
    
    // 监听内容变化，进行语法检查
    let syntaxCheckTimeout;
    scriptEditor.on('change', function(cm) {
        clearTimeout(syntaxCheckTimeout);
        syntaxCheckTimeout = setTimeout(function() {
            checkScriptSyntax(cm.getValue());
        }, 500); // 延迟 500ms 检查，避免频繁检查
    });
    
    // 加载已保存的脚本或设置默认模板
    const savedScript = currentSchema?.script;
    if (savedScript) {
        scriptEditor.setValue(savedScript);
    } else {
        // 设置初始提示文本
        scriptEditor.setValue(`// 在此编写处理函数（支持箭头函数或普通函数）
// 参数：
//   index - 行索引
//   data - 当前行数据对象（只读）
//   source - 整个表的数据数组（只读）
// 全局函数：
//   update(index, newData) - 更新指定行的数据
// 提示：输入 data. 或 source. 会自动弹出字段补全列表

(index, data, source) => {
    // 示例 1：返回数据对象
    return data;
    
    // 示例 2：更新数据并预览效果
    // update(index, { 年龄: data.年龄 + 1 });
    // return { 姓名: data.姓名, 年龄: data.年龄 };  // 查询结果会显示更新后的年龄
    
    // 示例 3：访问其他行数据
    // const prevRow = source[index - 1];
    // return { ...data, prev_value: prevRow?.some_field };
}`);
    }
}

// ==================== 辅助函数 ====================

// 深拷贝对象（避免修改原数据）
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    
    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }
    
    if (Array.isArray(obj)) {
        return obj.map(item => deepClone(item));
    }
    
    const cloned = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            cloned[key] = deepClone(obj[key]);
        }
    }
    return cloned;
}

// 深冻结对象（使其只读）
function deepFreeze(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    
    Object.freeze(obj);
    
    Object.getOwnPropertyNames(obj).forEach(prop => {
        if (obj[prop] !== null && typeof obj[prop] === 'object' && !Object.isFrozen(obj[prop])) {
            deepFreeze(obj[prop]);
        }
    });
    
    return obj;
}

// 根据字段类型转换值
function convertFieldValue(value, field) {
    if (value === null || value === undefined) {
        return value;
    }
    
    if (!field) {
        return value;
    }
    
    switch (field.type) {
        case 'number':
            const num = Number(value);
            if (isNaN(num)) {
                throw new Error(`无法转换为数字: ${value}`);
            }
            return num;
            
        case 'text':
            return String(value);
            
        case 'color':
            // 保持颜色格式
            return String(value);
            
        case 'list':
            if (!Array.isArray(value)) {
                throw new Error('list 类型必须是数组');
            }
            return value;
            
        case 'entry':
            if (!Array.isArray(value)) {
                throw new Error('entry 类型必须是数组');
            }
            return value;
            
        case 'dict':
            if (typeof value !== 'object' || Array.isArray(value)) {
                throw new Error('dict 类型必须是对象');
            }
            return value;
            
        case 'option':
        case 'datalist':
            return value; // 枚举值直接返回
            
        default:
            return value;
    }
}

// ==================== 脚本语法检查 ====================

function checkScriptSyntax(code) {
    const warningDiv = document.getElementById('script-syntax-warning');
    const warningText = document.getElementById('script-warning-text');
    
    if (!code || !code.trim()) {
        warningDiv.style.display = 'none';
        return;
    }
    
    // 移除注释和空行
    const cleanCode = code
        .split('\n')
        .filter(line => !line.trim().startsWith('//'))
        .join('\n')
        .trim();
    
    if (!cleanCode) {
        warningDiv.style.display = 'none';
        return;
    }
    
    // 检查是否符合预期格式
    const arrowFuncPattern = /^\s*\(([^)]*)\)\s*=>\s*\{[\s\S]*\}\s*$/;
    const arrowFuncShortPattern = /^\s*\(([^)]*)\)\s*=>\s*[^{][\s\S]*$/;
    const funcPattern = /^\s*function\s*\(([^)]*)\)\s*\{[\s\S]*\}\s*$/;
    
    const isValidArrow = arrowFuncPattern.test(cleanCode);
    const isValidArrowShort = arrowFuncShortPattern.test(cleanCode);
    const isValidFunc = funcPattern.test(cleanCode);
    
    if (!isValidArrow && !isValidArrowShort && !isValidFunc) {
        warningText.textContent = '函数格式不正确！请使用 (index, data) => { ... } 或 function(index, data) { ... }';
        warningDiv.style.display = 'flex';
    } else {
        // 检查参数是否正确
        let params = '';
        if (isValidArrow || isValidArrowShort) {
            const match = cleanCode.match(/^\s*\(([^)]*)\)\s*=>/);
            params = match ? match[1].trim() : '';
        } else if (isValidFunc) {
            const match = cleanCode.match(/^\s*function\s*\(([^)]*)\)/);
            params = match ? match[1].trim() : '';
        }
        
        // 检查参数格式（应该有 2-3 个参数）
        const paramList = params.split(',').map(p => p.trim()).filter(p => p);
        if (paramList.length < 2 || paramList.length > 3) {
            warningText.textContent = '建议使用 2-3 个参数：(index, data) => { ... } 或 (index, data, source) => { ... }';
            warningDiv.style.display = 'flex';
        } else {
            warningDiv.style.display = 'none';
        }
    }
}

// ========== 工具函数 ==========
