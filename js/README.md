# JavaScript 模块说明

本项目的JavaScript代码已按功能模块拆分为以下文件：

## 文件结构

### 1. common.js (233行)
**公共配置和工具函数**
- API接口配置 (`API_BASE`, `API`)
- 全局状态变量 (`currentSchema`, `schemas`, `dataRows`, `enums`等)
- 工具函数：
  - `normalizeFieldKey()` - 字段名标准化（支持数字键）
  - `getFieldValue()` / `setFieldValue()` - 字段值读写
  - `escapeHtml()` - HTML转义
  - `updateColorFromPicker()` / `updateColorFromText()` - 颜色处理
  - `showModal()` / `closeModal()` - 确认对话框
- 应用初始化 (`initializeApp()`)
- 标签切换 (`switchTab()`)

### 2. schema-manager.js (1155行)
**Schema（配置结构）管理**
- Schema列表加载与渲染
- Schema创建、编辑、保存、删除
- 字段管理：
  - 字段类型支持：text, number, color, entry, option, datalist
  - 字段编辑器渲染
  - 子字段管理（entry类型）
  - 数据源配置（manual, linked, enum）
- Schema迁移：
  - 自动检测字段变更
  - 数据自动迁移（新增字段填充默认值，删除字段数据丢失警告）
  - 条目数组智能映射

**主要函数**：
- `loadSchemas()` - 加载Schema列表
- `renderSchemaList()` - 渲染Schema列表
- `addNewSchema()` / `editSchema()` - 新建/编辑Schema
- `saveSchema()` - 保存Schema
- `deleteSchema()` - 删除Schema
- `addField()` / `removeField()` - 添加/删除字段
- `renderFieldEditor()` - 渲染字段编辑器
- `collectFields()` / `collectSubfields()` - 收集字段配置
- `migrateDataForSchemaChange()` - 数据迁移

### 3. data-manager.js (1559行)
**配表数据管理**
- 配表数据的CRUD操作
- 数据行编辑器
- 字段输入组件：
  - 文本输入（支持原始文本标记）
  - 数字输入
  - 颜色选择器
  - 下拉选项（option）
  - 数据列表（datalist，支持值+标签）
  - 条目数组（entry，动态添加/删除）
- 关联字段选项加载（从其他配表或枚举）
- 数据预览
- Lua代码导出：
  - Table格式（键值对）
  - Array格式（索引数组）
  - 类型定义生成
  - 原始文本支持（无引号键名）
  - Require依赖管理

**主要函数**：
- `loadSchemaSelectOptions()` - 加载Schema选择列表
- `loadDataForSchema()` - 加载指定Schema的数据
- `addDataRow()` / `removeDataRow()` - 添加/删除数据行
- `renderDataRowEditor()` - 渲染数据行编辑器
- `createFieldInput()` - 创建字段输入组件
- `getFieldOptions()` - 获取字段选项（支持关联加载）
- `saveData()` - 保存数据到服务器
- `exportToLua()` - 导出Lua代码
- `generateLuaCode()` - 生成Lua代码
- `generateTypeDefinition()` - 生成类型定义

### 4. enum-manager.js (594行)
**枚举管理**
- 枚举的CRUD操作
- 枚举类型支持：
  - `number` - 数字枚举
  - `string` - 字符串枚举
  - `flag` - 位标志枚举（使用位移操作）
- 枚举值编辑（键名、值、注释）
- 标志类型预览（二进制可视化）
- Lua代码导出
- 从枚举填充数据行：
  - 键/值模式选择
  - 前缀选项（EnumName.Value）
  - 原始文本标记
  - 智能去重（已存在的不添加）

**主要函数**：
- `loadEnums()` - 加载枚举列表
- `renderEnumList()` - 渲染枚举列表
- `addNewEnum()` / `editEnum()` - 新建/编辑枚举
- `saveEnum()` - 保存枚举
- `deleteEnum()` - 删除枚举
- `renderEnumValuesList()` - 渲染枚举值列表
- `addEnumValue()` / `removeEnumValue()` - 添加/删除枚举值
- `exportEnumToLua()` - 导出为Lua代码
- `previewEnumValues()` - 预览枚举值（标志类型显示二进制）
- `showFillFromEnumDialog()` - 显示填充对话框
- `confirmFillFromEnum()` - 确认从枚举填充数据行

## 加载顺序

在 `index.html` 中按以下顺序加载：

```html
<script src="js/common.js"></script>
<script src="js/enum-manager.js"></script>
<script src="js/schema-manager.js"></script>
<script src="js/data-manager.js"></script>
```

**重要**：`common.js` 必须首先加载，因为它包含了其他模块依赖的全局变量和工具函数。

## 模块间依赖

### 全局状态共享
所有模块共享 `common.js` 中定义的全局变量：
- `schemas` - Schema列表
- `currentSchema` - 当前编辑的Schema
- `enums` - 枚举列表
- `dataRows` - 当前配表的数据行

### 函数调用关系
- `data-manager.js` 调用：
  - `common.js`: `getFieldValue()`, `setFieldValue()`, `normalizeFieldKey()`
  - `schema-manager.js`: `getTypedDefaultValue()` (数据迁移时)
- `enum-manager.js` 调用：
  - `common.js`: `showModal()`
  - `data-manager.js`: `renderDataRowsList()` (填充后刷新列表)
- `schema-manager.js` 调用：
  - `common.js`: `getFieldValue()`, `setFieldValue()`, `showModal()`

## 重构历史

- **2025-11-02**: 从单个 `script.js` (3532行) 拆分为4个模块化文件
  - 提高代码可维护性
  - 便于团队协作
  - 加快加载速度（可按需加载）
  - 原始文件已备份为 `script.js.backup`
