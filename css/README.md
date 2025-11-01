# CSS 样式模块说明

本项目的CSS样式已按功能模块拆分为以下文件：

## 文件结构

### 1. common.css (135行)
**公共和基础样式**
- 全局重置样式 (`*`, `body`)
- 容器布局 (`.container`)
- 头部样式 (`.header`, `.nav-tabs`, `.nav-tab`)
- 面板通用样式 (`.panel`)
- 按钮样式 (`.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-sm`)
- 通用表单组件 (`.form-group`, `.form-control`, `.form-label`)
- 通用工具类

**主要组件**：
- 导航标签页
- 按钮组
- 基础表单元素
- 容器和布局

### 2. schema.css (347行)
**Schema 结构编辑样式**
- Schema列表样式 (`.schema-item`, `.schema-item-header`, `.schema-item-actions`)
- Schema编辑器布局 (`.schema-editor`, `.schema-editor-header`)
- 左右分栏编辑器 (`.editor-split-view`, `.editor-left`, `.editor-right`)
- 字段列表 (`.field-list-item`, `.field-list-item-header`)
- 字段编辑器 (`.field-editor`, `.field-editor-header`)
- 字段类型特定样式 (`.field-compact-row`, `.field-options-row`)
- 子字段容器 (`.entry-subfields`, `.subfield-item`)
- 字段数据源配置

**覆盖的UI组件**：
- Schema 列表卡片
- 字段列表项
- 字段编辑表单
- 条目子字段编辑器
- 数据源选择器

### 3. data.css (771行)
**配表数据编辑样式**
- 数据行列表 (`.data-row-list-item`, `.data-row-name`)
- 数据行编辑器 (`.data-row-editor`, `.data-row-editor-header`)
- 数据行名称区域 (`.data-row-name-section`, `.data-row-name-input`)
- Schema选择器 (`.schema-selector`)
- 数据输入字段 (`.data-field-row`, `.data-field-label`, `.data-field-input`)
- 条目类型特殊样式 (`.entry-container`, `.entry-item`)
- 条目子字段配置 (`.entry-subfield-row`)
- 数据列表样式 (`.datalist-wrapper`, `.datalist-input`, `.datalist-dropdown`)
- 自定义下拉选择器
- 颜色选择器 (`.color-input-wrapper`, `.color-preview`, `.color-picker`)
- 模态框样式 (`.modal`, `.modal-content`, `.modal-actions`)
- 预览表格 (`.preview-table`)
- Lua导出样式 (`.lua-code-preview`, `.require-list`)
- Lua语法高亮 (`.lua-keyword`, `.lua-string`, `.lua-comment`, `.lua-number`)
- 重复警告和概率显示
- 响应式设计
- 滚动条美化

**覆盖的UI组件**：
- 配表数据行列表
- 数据编辑器
- 各种字段输入控件
- 条目数组管理
- 预览和导出界面
- 模态对话框

### 4. enum.css (164行)
**枚举管理样式**
- 枚举管理面板 (`.enum-panel`, `.enum-sidebar`)
- 枚举编辑器 (`.enum-editor`, `.enum-editor-header`)
- 枚举值列表 (`.enum-value-item`)
- 枚举类型选择
- 枚举预览模态框 (`.enum-preview-item`, `.enum-preview-key`, `.enum-preview-value`)
- 二进制预览样式 (`.enum-preview-binary`, `.bit-1`, `.bit-0`)
- 填充枚举对话框

**覆盖的UI组件**：
- 枚举列表和编辑
- 枚举值管理
- 标志类型二进制预览
- 填充选项对话框

## 加载顺序

在 `index.html` 中按以下顺序加载：

```html
<link rel="stylesheet" href="css/common.css">  <!-- 1️⃣ 先加载公共样式 -->
<link rel="stylesheet" href="css/schema.css"> <!-- 2️⃣ Schema样式 -->
<link rel="stylesheet" href="css/data.css">   <!-- 3️⃣ 数据样式 -->
<link rel="stylesheet" href="css/enum.css">   <!-- 4️⃣ 枚举样式 -->
```

**重要**：`common.css` 必须首先加载，因为它包含了基础样式和通用组件样式，其他模块会继承和覆盖这些样式。

## 样式组织原则

### 层叠结构
```
common.css (基础层)
    ↓ 继承
schema.css (Schema功能)
data.css (数据功能)
enum.css (枚举功能)
```

### 命名规范
- **BEM风格**：`.block__element--modifier`
- **功能前缀**：
  - `.schema-*` - Schema相关
  - `.data-*` - 数据/配表相关
  - `.enum-*` - 枚举相关
  - `.field-*` - 字段相关
  - `.entry-*` - 条目类型相关
  - `.modal-*` - 模态框相关

### 复用策略
- 通用按钮、表单样式在 `common.css` 中定义
- 特定功能的样式在对应模块中定义
- 避免样式冲突，使用明确的类名前缀

## 文件大小对比

| 文件 | 行数 | 占比 | 用途 |
|------|------|------|------|
| common.css | 135 | 9.5% | 基础样式和通用组件 |
| schema.css | 347 | 24.5% | Schema结构编辑 |
| data.css | 771 | 54.4% | 配表数据编辑（最复杂） |
| enum.css | 164 | 11.6% | 枚举管理 |
| **总计** | **1417** | **100%** | 完整样式系统 |

## 优化建议

### 已完成
✅ 按功能模块拆分
✅ 清晰的命名规范
✅ 复用通用样式

### 未来可优化
- 使用 CSS 变量（`:root`）统一颜色和尺寸
- 考虑使用 CSS 预处理器（Sass/Less）
- 进一步提取可复用的 mixin
- 添加深色模式支持

## 重构历史

- **2025-11-02**: 从单个 `style.css` (1415行) 拆分为4个模块化文件
  - 提高代码可维护性
  - 便于团队协作
  - 加快页面加载（可按需加载）
  - 原始文件已备份为 `style.css.backup`

## 依赖关系

### CSS 模块
```
common.css (独立，无依赖)
    ↓
schema.css (依赖 common.css 的按钮、表单样式)
data.css (依赖 common.css 的按钮、表单样式)
enum.css (依赖 common.css 的按钮、表单样式)
```

### 与 JavaScript 的关系
- `common.css` → 所有 JS 模块使用
- `schema.css` → `js/schema-manager.js`
- `data.css` → `js/data-manager.js`
- `enum.css` → `js/enum-manager.js`

## 调试技巧

1. **查看特定模块样式**：在浏览器开发者工具中过滤 CSS 文件
2. **样式冲突排查**：检查样式优先级和加载顺序
3. **性能分析**：使用 Coverage 工具查看未使用的 CSS
4. **快速定位**：通过类名前缀快速找到对应的 CSS 文件
