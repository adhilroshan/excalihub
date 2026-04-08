# Contributing to ExcaliHub

Thank you for your interest in contributing to ExcaliHub! 🎉

## How to Contribute

### Reporting Bugs

Found a bug? Please open an issue with:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior vs actual behavior
- Screenshots if applicable
- Browser version and extension version

### Suggesting Features

Have an idea? Open an issue with:

- A clear description of the feature
- The problem it solves
- Any alternatives you've considered

### Pull Requests

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes**
4. **Test the extension** (see below)
5. **Commit your changes**
   ```bash
   git commit -m "feat: add amazing feature"
   ```
6. **Push to your fork**
   ```bash
   git push origin feature/amazing-feature
   ```
7. **Open a Pull Request**

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/excalihub.git
   cd excalihub
   ```

2. Load the extension in Chrome:
   - Open `chrome://extensions/`
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select the project folder

3. Make changes and reload the extension to test

## Testing

Since this is a Chrome extension, testing is primarily manual:

1. **Authentication Flow**
   - Test GitHub Device Flow authentication
   - Verify token storage and retrieval
   - Test sign-out functionality

2. **Save Functionality**
   - Test saving drawings to GitHub
   - Verify correct file path and naming
   - Test with different Excalidraw scenes

3. **Edge Cases**
   - Empty canvas
   - Large drawings
   - Network errors
   - Invalid configurations

## Code Style

- Use meaningful variable and function names
- Add comments for complex logic
- Follow existing code patterns
- Keep functions focused and small

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `chore:` - Maintenance tasks

Examples:
```
feat: add dark mode support
fix: handle empty canvas edge case
docs: update setup instructions
```

## Security Guidelines

- **Never commit secrets** (tokens, private keys, etc.)
- The OAuth Client ID is public by design and safe to commit
- If you discover a security vulnerability, please open an issue privately or email the maintainer

## Questions?

Feel free to open a discussion or ask in any issue. No question is too small!

## Code of Conduct

Be respectful, inclusive, and helpful. We're all here to make ExcaliHub better for everyone.

---

Thank you for contributing! 🙏
