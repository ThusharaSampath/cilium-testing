import { test } from "@playwright/test";
import { components } from "../config/components.js";
import { createComponent } from "../helpers/component-creator.js";

// If COMPONENT_NAME is set, only create that one component
const targetName = process.env.COMPONENT_NAME;

const targetComponents = targetName
  ? components.filter((c) => c.name === targetName)
  : components;

if (targetName && targetComponents.length === 0) {
  throw new Error(
    `Component "${targetName}" not found. Available: ${components.map((c) => c.name).join(", ")}`
  );
}

for (const component of targetComponents) {
  test(`Create component: ${component.name}`, async ({ page }) => {
    await createComponent(page, component);
  });
}
