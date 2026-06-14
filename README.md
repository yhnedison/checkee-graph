# Checkee Graph

## English

### Overview

Interactive weekly visa-clearance charts for [Checkee](https://www.checkee.info).

Checkee Graph is a lightweight Chrome extension that adds an expandable analytics panel to `checkee.info`. It pulls Checkee monthly pages at a controlled pace, caches the latest successful pull locally, and turns the data into interactive bar charts by week and visa type.

### Features

- Weekly cleared cases by visa type, shown as stacked bar charts.
- Weekly long-wait clearances by visa type, where long-wait means 30 or more days from case creation/submission to clearance.
- Weekly new cases vs cleared cases, shown as grouped bar charts.
- Weekly net case change for the selected time range, using the range start as zero point and showing the total net change through now.
- Time range selector: last 6 months, last 1 year, last 2 years, last 5 years, and max.
- Local cache per time range, so the page can show the last successful pull without fetching automatically.
- Manual refresh only. Data is loaded when you click **Refresh**, not every time the page opens.
- Newest-to-oldest monthly loading with at least one second between requests.
- Click a visa type to show only that category. Click it again to return to all categories.
- JSON/CSV import for manual or exported data.

### Installation

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the `checkee-graph` folder.
6. Open [https://www.checkee.info](https://www.checkee.info).

### Usage

1. Open any Checkee page.
2. The Checkee Graph panel appears expanded at the top of the page.
3. Choose a **Time range**.
4. Click **Refresh** to pull fresh monthly data for the selected range.
5. Watch the first three charts update while data is loading. The net-change chart updates after the full pull finishes so the total is calculated from complete data.
6. Click a visa type in the left sidebar to focus that category. Click it again to clear the filter.
7. Use **Import** to load JSON/CSV data when automatic extraction cannot find records.

### Data Loading

Checkee Graph uses the monthly Checkee URL format:

```text
https://www.checkee.info/main.php?dispdate=YYYY-MM
```

When you click **Refresh**, it clears the current view, fetches only the months needed for the selected time range, parses records from those pages, and overwrites that range's local cache after a successful pull.

Examples:

- **Last 1 year** loads roughly the past 12 months.
- **Last 5 years** loads roughly the past 60 months.
- **Max** loads from the current month back to December 2008.

### Import Format

The importer accepts JSON or CSV with flexible field names. Useful fields include:

- `visaType`, `visa_type`, `visa`, `type`
- `createdAt`, `submitDate`, `checkDate`, `date`
- `clearedAt`, `clearanceDate`, `clearDate`
- `status`

### Privacy

All analysis runs inside your browser. Successful pulls are stored in Chrome extension local storage on your own machine. The extension does not send data to any third-party analytics service.

### Development

This is a Manifest V3 extension with no build step and no external runtime dependencies.

```text
checkee-graph/
├── manifest.json
├── content.js
├── overlay.css
└── README.md
```

After changing code:

1. Open `chrome://extensions`.
2. Click the reload button on **Checkee Graph**.
3. Refresh the Checkee browser tab.

### Repository Description

Interactive Chrome extension for visualizing Checkee visa-clearance trends with weekly bar charts, time ranges, local caching, and controlled monthly data loading.

### License

No license has been selected yet. Add a license before publishing if you want others to reuse or modify the project.

## 中文

### 简介

Checkee Graph 是一个轻量级 Chrome 扩展，会在 `checkee.info` 页面顶部加入可展开的数据分析面板。它按月拉取 Checkee 页面数据，控制请求速度以避免过快触发限制，并把结果按周、签证类型展示为交互式柱状图。

### 功能

- 按签证类型统计每周 clear 数量，并用堆叠柱状图展示。
- 统计长等待 clear 案例，长等待定义为从提交/创建到 clear 间隔大于等于 30 天。
- 展示每周新增 case 与 clear case 的对比。
- 按当前选择的 time range，以起始时间为 0 点，计算每周 case 净增减以及累计净增减。
- 支持时间范围：最近 6 个月、最近 1 年、最近 2 年、最近 5 年、最大范围。
- 按时间范围保存本地缓存，页面打开时优先展示上次成功拉取的数据。
- 只在点击 **Refresh** 时刷新数据，不会每次打开页面自动请求。
- 从最新月份向旧月份拉取，每月至少间隔 1 秒，降低被 throttle 的风险。
- 点击左侧签证类型只显示该类型，再次点击取消筛选。
- 支持导入 JSON/CSV 数据。

### 安装

1. 下载或 clone 本仓库。
2. 在 Chrome 中打开 `chrome://extensions`。
3. 打开 **开发者模式**。
4. 点击 **加载已解压的扩展程序**。
5. 选择 `checkee-graph` 文件夹。
6. 打开 [https://www.checkee.info](https://www.checkee.info)。

### 用法

1. 打开任意 Checkee 页面。
2. Checkee Graph 面板会默认展开显示在页面顶部。
3. 选择 **Time range**。
4. 点击 **Refresh**，只拉取当前选择时间范围内的月度数据。
5. 前三张图会在加载过程中实时更新。第四张净增减图会等完整拉取结束后再计算，避免用不完整数据算错总量。
6. 点击左侧签证类型可只看该类型；再次点击恢复显示全部。
7. 如果自动解析不到数据，可以使用 **Import** 导入 JSON/CSV。

### 数据加载

Checkee Graph 使用 Checkee 的月度页面 URL 格式：

```text
https://www.checkee.info/main.php?dispdate=YYYY-MM
```

点击 **Refresh** 后，扩展会清空当前视图，只拉取当前 time range 需要的月份，解析页面中的记录，并在成功完成后覆盖该时间范围对应的本地缓存。

示例：

- **Last 1 year** 只加载最近约 12 个月。
- **Last 5 years** 只加载最近约 60 个月。
- **Max** 会从当前月份一直加载到 2008 年 12 月。

### 导入格式

导入器支持 JSON 或 CSV，并尽量兼容不同字段名。常用字段包括：

- `visaType`, `visa_type`, `visa`, `type`
- `createdAt`, `submitDate`, `checkDate`, `date`
- `clearedAt`, `clearanceDate`, `clearDate`
- `status`

### 隐私

所有分析都在浏览器本地运行。成功拉取的数据会保存在你本机的 Chrome 扩展本地存储中。扩展不会把数据发送给第三方分析服务。

### 开发

这是一个 Manifest V3 扩展，没有构建步骤，也没有外部运行时依赖。

```text
checkee-graph/
├── manifest.json
├── content.js
├── overlay.css
└── README.md
```

修改代码后：

1. 打开 `chrome://extensions`。
2. 点击 **Checkee Graph** 卡片上的 reload 按钮。
3. 刷新 Checkee 页面。

### GitHub 简介

用于 Checkee 的交互式 Chrome 扩展，支持按周柱状图、时间范围筛选、本地缓存和限速月度数据拉取，帮助查看签证 clear 趋势。

### 许可证

暂时还没有选择许可证。如果你希望其他人复用或修改这个项目，发布前建议添加一个 license。
