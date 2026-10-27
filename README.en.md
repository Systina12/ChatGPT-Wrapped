# ChatGPT Wrapped

[中文](README.md) | **English**

Turn your ChatGPT history into your own year in review.

[**Create your report →**](https://systina12.github.io/ChatGPT-Wrapped/)

![ChatGPT Wrapped annual report preview: a purple background, lime green artwork and a message total](docs/images/report-preview.png)

*Screenshot of the app using synthetic demo data. No real chat history is shown.*

## Get started

1. In ChatGPT, open **Settings → Data Controls → Export Data** and download your official export.
2. Open the website above and select the ZIP file or the complete extracted folder.
3. Explore the overview and enter your annual report. Adjust the year, timezone and scope, then create a share card.

Switch the website to English using **语言 / Language** in the top right corner.

[Official ChatGPT export instructions](https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data)

## Inside your report

- **A 14-page year in review:** activity patterns, streaks, favorite models, keywords, longest conversations, attachments and more.
- **Flexible scope:** choose a year or date range, message roles, conversation branches and whether to include group chats.
- **Yearly comparisons and complete statistics:** see changes from the previous year and explore rankings, charts and import warnings.
- **Local share cards:** generate SVG or PNG images, with optional keywords and conversation titles.
- **Chinese and English:** mobile layouts, keyboard navigation and reduced motion support.

## Your data stays on your device

Chat files are processed locally in your browser and never uploaded to a server. No account, analytics or remote fonts are required.

A report is stored in your browser only when you click **Save locally**, and you can clear it at any time. Share cards contain aggregate statistics by default. Before downloading a report JSON, the app warns that it may contain sensitive titles, keywords, message excerpts and attachment names.

## Large exports and saved reports

Raw ZIP and folder imports have no fixed file size limit. The app reads relevant chat JSON on demand without extracting images, audio or other attachments. Available device memory determines the practical capacity; you can cancel an import.

Previously generated **summary report JSON** files can be imported up to 20 MiB. You can view these reports and create share cards. To change their scope, import the original ZIP or folder. Folder selection varies by browser; use ZIP if your browser does not support it.

## Run locally

Use Node.js 24:

```sh
npm ci
npm run dev
```

Build the static website:

```sh
npm run build
```
