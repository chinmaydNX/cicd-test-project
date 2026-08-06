# cicd-test-project

Minimal Node.js hello-world app for testing NXRadar CI/CD SBOM pipelines.

## Quick start

```bash
npm install
npm start
# Hello, World!

npm start -- Alice
# Hello, Alice!

npm test
```

## Push to GitHub

```bash
cd cicd-test-project
git init
git add .
git commit -m "Initial hello-world project for CI/CD testing"
gh repo create cicd-test-project --public --source=. --remote=origin --push
```

Or create an empty repo on GitHub first, then:

```bash
git remote add origin git@github.com:<your-org>/cicd-test-project.git
git branch -M main
git push -u origin main
```

## What this contains

| File | Purpose |
|------|---------|
| `index.js` | Hello-world entrypoint |
| `test/hello.test.js` | Tiny Node built-in test suite |
| `package.json` | Declares `lodash` so SBOM scans have a real dependency |
