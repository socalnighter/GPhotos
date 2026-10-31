# Privacy Policy

**GPhotos Backup** is a browser extension that saves your own Google Photos library to a folder on your device. This policy explains what it does with data.

*Last updated: October 31, 2026*

## What data the extension handles

The extension reads the list of photos shown on photos.google.com in the browser where you are already signed in, and downloads the original files of those photos. It reads each photo's metadata (such as the date taken and camera model) from the downloaded file so it can place the file in the right folder.

## What happens to that data

All of it stays on your device. The extension:

- **does not** send your photos, metadata, or any personal information to the developer or to any third party;
- **does not** use analytics, tracking, advertising, or remote code;
- **does not** collect, read, or store your Google account name, email address, or password;
- **does not** have any server of its own.

Photos are downloaded directly from Google's servers to your browser and written straight into the folder you choose.

## What is stored, and where

- **In your backup folder:** the photos themselves, plus a small hidden file, `.photos-backup-index.json`, that lists which photos have already been saved so a later run can skip them. You can delete it at any time.
- **In your browser:** your last-used settings (folder pattern, file name pattern, and option values) are kept in the extension's local storage. This never leaves your device and is removed if you uninstall the extension.

## Permissions

The extension asks only for the access it needs to do this one job: access to photos.google.com and Google's image servers (to find and download your photos), the ability to attach to an already-open Photos tab, and the ability to keep the screen awake during a backup. See the README for details.

## Children's privacy

The extension collects no personal information from anyone, including children.

## Changes

If this policy changes, the new version will be published in this repository with an updated date.

## Contact

Open an issue in this repository.
