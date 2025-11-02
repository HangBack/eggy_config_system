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
    const schemaName = document.getElementById('data-schema-select').value;
    
    if (!schemaName) {
        document.getElementById('data-editor').style.display = 'none';
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
            alert('加载Schema失败');
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
        renderDataRowsList();
        document.getElementById('data-row-editor-container').innerHTML = 
            '<div class="empty-state"><i class="fas fa-hand-pointer"></i><p>请从左侧选择或添加数据行</p></div>';
        document.getElementById('data-editor').style.display = 'block';
        document.getElementById('data-table-title').textContent = `${schemaName} - 配表数据`;
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

    dataRows.forEach((dataRow, index) => {
        const item = createDataRowListItem(dataRow, index);
        container.appendChild(item);
    });

    if (dataRows.length === 0) {
        container.innerHTML = '<p style="color: #95a5a6; text-align: center; padding: 20px;">暂无数据</p>';
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
        if (field.type === 'entry' || field.type === 'list') {
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
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));
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
        
        case 'entry':
            inputHtml = createEntryInput(field, value, rowIndex);
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
    
    let html = `<div class="preview-table-wrapper">
        <table class="preview-table">
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
    
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

function closePreviewModal() {
    const modal = document.getElementById('preview-modal');
    modal.classList.remove('show');
}

function collectData() {
    const data = [];

    dataRows.forEach((dataRow, rowIndex) => {
        const rowData = {};
        const fields = currentSchema.fields || [];

        fields.forEach(field => {
            if (field.type === 'entry' || field.type === 'list') {
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
    keyTypeGroup.style.display = format === 'table' ? 'block' : 'none';
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
    const namespace = document.getElementById('export-namespace').value.trim() || 'Tile';
    const tableKeyType = document.getElementById('export-table-key-type').value.trim() || 'string';
    const data = collectData();
    const luaCode = generateLuaCode(data, format, namespace, tableKeyType);
    document.getElementById('lua-code-output').textContent = luaCode;
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

function generateTypeDefinition(schema, schemaName) {
    let code = '';
    const mainTypeName = toPascalCase(schemaName);
    
    // 先生成所有 entry 类型的子类定义
    const fields = schema.fields || [];
    fields.forEach(field => {
        if (field.type === 'entry' && field.subfields && field.subfields.length > 0) {
            const entryTypeName = toPascalCase(field.name);
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
        case 'entry':
            // 对于条目类型，使用字段名生成类型名
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
        
        if (field.type === 'entry' && Array.isArray(value)) {
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

// ========== 工具函数 ==========
