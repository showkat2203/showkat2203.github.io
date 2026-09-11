---
title: Reconciliation is a product feature, not a repair step
description: >-
  Asynchronous integration means updates arrive dropped, duplicated, and out of
  order. Treating the fix as a background chore is what makes consistency
  commitments impossible to keep.
date: 2026-09-01
tags: [distributed systems, consistency]
draft: false
---

This is an example post so the writing section has something in it. Delete this
file, or rewrite it, and add your own posts as Markdown files in
`src/content/blog/`.

## What the front matter controls

Every post needs a `title`, a `description`, and a `date`. The description is
what appears on the card and in the page's meta tags, so it is worth writing
properly rather than letting it be generated from the first paragraph. Set
`draft: true` while a post is unfinished and it stays out of the build.

## What you can write

Normal Markdown: headings, lists, links, block quotes, and fenced code.

```java
// Replaying an out-of-order update is only safe if applying it twice
// produces the same state as applying it once.
if (event.version() <= current.version()) {
  return current;
}
```

> A consistency commitment is something a system holds, not something a design
> asserts.

Tables work too:

| Broker   | Ordering        | Throughput |
| -------- | --------------- | ---------- |
| Kafka    | per partition   | highest    |
| Pulsar   | per key         | high       |
| Artemis  | per queue       | moderate   |

Reading time is computed from the word count, so you do not need to set it.
