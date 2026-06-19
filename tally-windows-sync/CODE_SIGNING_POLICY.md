# Code signing policy
This project signs and distributes release artifacts.

## Windows — SignPath Foundation
Free code signing provided by SignPath.io, certificate by SignPath Foundation.

### What will be signed
- Windows installer packages (TallyLink-Setup-*.exe) published on GitHub Releases.

### Build and signing process
- Artifacts are built from this repository using GitHub Actions CI.
- Only CI-built artifacts will be submitted to SignPath for signing.
- The private key is held by SignPath (HSM-backed). This project does not store the private key.

### Release process
- Maintainers create a GitHub Release with the installer attached.
- SignPath signs the installer automatically via GitHub Actions.
- Signed installer is published as a release artifact.
