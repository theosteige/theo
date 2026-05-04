import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false)
  })
});

const reading = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/reading" }),
  schema: z.object({
    title: z.string(),
    author: z.string().optional(),
    status: z.enum(["reading", "finished", "paused", "planned"]).default("planned"),
    date: z.coerce.date().optional(),
    link: z.url().optional(),
    tags: z.array(z.string()).default([])
  })
});

const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    status: z.enum(["active", "paused", "complete", "archived"]).default("active"),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    links: z
      .array(
        z.object({
          label: z.string(),
          url: z.url()
        })
      )
      .default([])
  })
});

const experience = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/experience" }),
  schema: z.object({
    organization: z.string(),
    role: z.string(),
    location: z.string().optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    current: z.boolean().default(false),
    tags: z.array(z.string()).default([])
  })
});

export const collections = { blog, reading, projects, experience };
