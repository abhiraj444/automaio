import { Recipe, RecipeSchema } from '../types/recipe.js';
import { promises as fs } from 'fs';
import path from 'path';

export class RecipeStore {
  private recipes: Map<string, Recipe> = new Map();
  private storageDir: string;

  constructor(storageDir: string = './data/recipes') {
    this.storageDir = storageDir;
  }

  async init(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      const files = await fs.readdir(this.storageDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = await fs.readFile(path.join(this.storageDir, file), 'utf-8');
          const parsed = RecipeSchema.parse(JSON.parse(content));
          this.recipes.set(parsed.id, parsed);
        }
      }
    } catch {
      // Storage directory empty or created fresh
    }
  }

  async save(recipe: Recipe): Promise<void> {
    RecipeSchema.parse(recipe);
    this.recipes.set(recipe.id, recipe);
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      await fs.writeFile(
        path.join(this.storageDir, `${recipe.id}.json`),
        JSON.stringify(recipe, null, 2),
        'utf-8'
      );
    } catch {
      // Memory fallback
    }
  }

  get(id: string): Recipe | undefined {
    return this.recipes.get(id);
  }

  findByTaskKey(taskKey: string): Recipe | undefined {
    for (const r of this.recipes.values()) {
      if (r.taskKey === taskKey) {
        return r;
      }
    }
    return undefined;
  }

  list(): Recipe[] {
    return Array.from(this.recipes.values());
  }
}
