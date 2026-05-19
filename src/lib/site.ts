export const site = {
  name: "Theo Steiger",
  description: "Personal website, writing, reading, projects, and experience.",
  contacts: [
    {
      label: "Email",
      href: "theohsteiger@gmail.com"
    },
    {
      label: "GitHub",
      href: "https://github.com/theosteige"
    },
    {
      label: "LinkedIn",
      href: "https://www.linkedin.com/in/theodore-steiger/"
    }
  ]
};

export function pathWithBase(path = "") {
  const base = import.meta.env.BASE_URL;
  const cleanPath = path.replace(/^\/+/, "");
  return `${base}${cleanPath}`;
}

export function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  });
}

export function formatYear(date: Date) {
  return date.getUTCFullYear();
}
