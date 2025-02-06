import { test, expect } from '@playwright/test';

// group home page tests
test('should load the home page successfully', async ({ page }) => {
  // navigate to the page with domcontentloaded wait strategy
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  
  // add initial delay
  await page.waitForTimeout(5000);

  // check heading
  await expect(page.getByText('Where ideas begin')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Bring ideas to life in seconds or get help on existing projects.')).toBeVisible({ timeout: 15000 });

  // check dropdowns
  const providerCombobox = page.getByRole('combobox').first();
  await expect(providerCombobox).toBeVisible({ timeout: 15000 });
  await expect(providerCombobox).toContainText('AmazonBedrock');

  const modelCombobox = page.getByRole('combobox').nth(1);
  await expect(modelCombobox).toBeVisible({ timeout: 15000 });
  await expect(modelCombobox).toContainText('Claude 3.5 Sonnet');

  // check chat input
  await expect(page.getByPlaceholder('How can Bolt help you today?')).toBeVisible({ timeout: 15000 });
});

test('should be able to select provider and model', async ({ page }) => {
  // navigate to the page with domcontentloaded wait strategy
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  
  // add initial delay
  await page.waitForTimeout(5000);

  // select provider
  const providerCombobox = page.getByRole('combobox').first();
  await expect(providerCombobox).toBeVisible({ timeout: 15000 });
  
  // select AmazonBedrock using the select element
  await providerCombobox.selectOption('AmazonBedrock');
  await expect(providerCombobox).toHaveValue('AmazonBedrock');

  // select model
  const modelCombobox = page.getByRole('combobox').nth(1);
  await expect(modelCombobox).toBeVisible({ timeout: 15000 });
  
  // select Claude model using the select element
  await modelCombobox.selectOption({ label: 'Claude 3.5 Sonnet (Bedrock)' });
  await expect(modelCombobox).toContainText('Claude 3.5 Sonnet');
});

test('should show API key input when provider is selected', async ({ page }) => {
  // navigate to the page and wait for load
  await page.goto('/', { waitUntil: 'load' });
  
  // wait for the page to be ready and interactive
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('load');
  
  // wait for any provider combobox to be available, with a more specific selector
  const providerSelector = '[role="combobox"], select';
  await page.waitForSelector(providerSelector, { state: 'visible', timeout: 15000 });

  // select provider
  const providerCombobox = page.getByRole('combobox').first();
  await expect(providerCombobox).toBeVisible({ timeout: 15000 });
  
  // wait for the combobox to be enabled and interactable
  await page.waitForSelector(`${providerSelector}:not([disabled])`, { timeout: 15000 });
  await providerCombobox.selectOption('AmazonBedrock');

  // check for API key label
  const apiKeyLabel = page.getByText('AmazonBedrock API Key:', { exact: true });
  await expect(apiKeyLabel).toBeVisible({ timeout: 15000 });

  // check for Get API Key button
  const getApiKeyButton = page.getByRole('button', { name: 'Get API Key' });
  await expect(getApiKeyButton).toBeVisible({ timeout: 15000 });
}); 