---
title: Video Upscaler
summary: A Python and FFmpeg CLI tool for improving short-form vertical video quality for TikTok, YouTube Shorts, and Instagram Reels.
status: complete
startDate: 2025-01-01
tags:
  - Python
  - FFmpeg
  - CLI
  - Video Processing
  - Short-Form Video
links:
  - label: Private Repository
    url: https://github.com/theosteige/Video-Upscaler
---

** note to self: add before and after video. (on my pc)

Built a Python CLI tool to improve the quality of short-form vertical videos while learning more about Python, FFmpeg, and practical video-processing workflows.

The tool uses FFmpeg motion interpolation to target 60 FPS playback, then applies a second processing pass that scales videos to 1080x1920 and sharpens the output with an unsharp filter. Audio is copied through without re-encoding.

I built this while running two short-form sports edit accounts, one focused on basketball and one focused on MMA, where I wanted posted videos to have the highest possible quality. Over roughly two months of posting, the best-performing basketball video reached about 600K views and the best-performing MMA video reached about 200K views.

The repository is currently private. Email me if you would like access.
