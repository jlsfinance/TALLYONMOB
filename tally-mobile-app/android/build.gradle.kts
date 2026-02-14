allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

// Custom build directory logic removed to fix "different roots" error on cross-drive Windows setups
// rootProject.layout.buildDirectory ...
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.buildDir)
}
