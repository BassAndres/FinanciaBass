# El puente con la página web: R8 no debe renombrar ni quitar estos métodos.
-keepclassmembers class io.github.bassandres.financiabass.Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
