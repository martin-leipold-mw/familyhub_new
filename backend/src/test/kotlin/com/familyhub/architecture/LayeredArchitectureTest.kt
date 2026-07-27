package com.familyhub.architecture

import com.tngtech.archunit.core.importer.ImportOption
import com.tngtech.archunit.junit.AnalyzeClasses
import com.tngtech.archunit.junit.ArchTest
import com.tngtech.archunit.lang.ArchRule
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses
import org.springframework.web.bind.annotation.RestController

/**
 * Architecture rules enforced as unit tests — the kind of layering a compiler
 * cannot check. These turn "creative reinterpretation" of the intended structure
 * into a red test the Stop-hook / CI catches.
 *
 * Layers are identified by naming convention (Spring Data repositories carry no
 * @Repository annotation) and by Spring stereotype where one exists.
 */
@AnalyzeClasses(
    packages = ["com.familyhub"],
    importOptions = [ImportOption.DoNotIncludeTests::class],
)
class LayeredArchitectureTest {
    @ArchTest
    val controllersMustNotTouchRepositories: ArchRule =
        noClasses()
            .that().haveSimpleNameEndingWith("Controller")
            .should().dependOnClassesThat().haveSimpleNameEndingWith("Repository")
            .because("controllers must go through a service, never a repository directly")

    @ArchTest
    val repositoriesMustNotDependUpwards: ArchRule =
        noClasses()
            .that().haveSimpleNameEndingWith("Repository")
            .should().dependOnClassesThat().haveSimpleNameEndingWith("Service")
            .orShould().dependOnClassesThat().haveSimpleNameEndingWith("Controller")
            .because("the persistence layer must not know about services or the web layer")

    @ArchTest
    val servicesMustNotDependOnControllers: ArchRule =
        noClasses()
            .that().haveSimpleNameEndingWith("Service")
            .should().dependOnClassesThat().haveSimpleNameEndingWith("Controller")
            .because("services are called by controllers, never the other way around")

    @ArchTest
    val restControllersAreNamedController: ArchRule =
        classes()
            .that().areAnnotatedWith(RestController::class.java)
            // generated OpenAPI *Api interfaces follow their own convention
            .and().resideOutsideOfPackage("com.familyhub.generated..")
            .should().haveSimpleNameEndingWith("Controller")
            .because("REST entry points are discoverable by the *Controller naming convention")
}
