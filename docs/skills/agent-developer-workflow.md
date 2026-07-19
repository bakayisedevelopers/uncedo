# Uncedo Developer Workflow

Use this guide to deploy functions, build release APKs, copy releases, prune git history, and push changes to GitHub.

## 1. Firebase Functions Deploy

Whenever backend/cloud function code under `functions/` (or rules/configs) is modified, deploy them to Firebase:
1. Navigate to the workspace root directory.
2. Run the deployment command:
   ```powershell
   firebase deploy --only functions
   ```

## 2. Compile Mobile Application Releases

Depending on which mobile applications have been modified, compile their release APKs.

### Build Uncedo App (Student/Customer Mobile App)
If files under `uncedo/` were modified:
1. Navigate to `uncedo/android`.
2. Run the Gradle release build command:
   ```powershell
   .\gradlew assembleRelease
   ```
3. Copy the output APK to the `releases` folder:
   ```powershell
   Copy-Item -Path "app/build/outputs/apk/release/uncedo-release.apk" -Destination "../../releases/android/uncedo-release.apk" -Force
   ```

### Build Helpers App (Service Provider Mobile App)
If files under `helpers/` were modified:
1. Navigate to `helpers/android`.
2. Run the Gradle release build command:
   ```powershell
   .\gradlew assembleRelease
   ```
3. Copy the output APK to the `releases` folder:
   ```powershell
   Copy-Item -Path "app/build/outputs/apk/release/helpers-release.apk" -Destination "../../releases/android/helpers-release.apk" -Force
   ```

## 3. Build and Deploy Web Apps

### Build Uncedo Web App
If files under `web/` were modified:
1. Navigate to `web`.
2. Run the production build:
   ```powershell
   npm install
   npm run build
   ```

### Build Admin Web App
If files under `admin/` were modified:
1. Navigate to `admin`.
2. Run the production build:
   ```powershell
   npm install
   npm run build
   ```

### Deploy Hosting
If either web app changed, deploy Firebase Hosting after building both outputs:
```powershell
firebase deploy --only hosting
```

If you only need the admin site, deploy the `uncedo-admin` site from the same Firebase project configuration.

---

## 4. Git Pruning and Push (Max 30 Commits)

To save storage and resources, the repository history must be kept to a maximum of **30 commits**.

### Step 3.1: Check Commit Count
At the workspace root, check the total number of commits:
```powershell
git rev-list --count HEAD
```

### Step 3.2: Perform Pruning (If Commits > 30)
If the commit count is **31 or more**, prune the older commits so that exactly 30 commits remain:
1. Get the commit hash of the 30th commit back (which will become the new parentless root commit):
   ```powershell
   $target_sha = git rev-parse HEAD~29
   ```
2. Create a temporary orphan branch starting at that commit:
   ```powershell
   git checkout --orphan temp-branch $target_sha
   ```
3. Commit all current files as the new parentless root commit:
   ```powershell
   git commit -m "root: squashed previous history"
   ```
4. Rebase the remaining 29 commits on top of this new root:
   ```powershell
   git rebase --onto temp-branch $target_sha main
   ```
5. Clean up the temporary branch:
   ```powershell
   git branch -D temp-branch
   ```
6. Verify that the history has been pruned to 30 commits:
   ```powershell
   git log --oneline
   ```
7. Force-push the pruned history to the main branch on GitHub:
   ```powershell
   git push origin main --force
   ```

### Step 3.3: Normal Push (If Commits <= 30)
If the commit count is **30 or less**, push to GitHub normally:
```powershell
git push origin main
```
