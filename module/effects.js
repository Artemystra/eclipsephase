var coll = document.getElementsByClassName("collapsible");
var i;

for (i = 0; i < coll.length; i++) {
    coll[i].addEventListener("click", function() {
        this.classList.toggle("collapsible");
        var itemdescription = this.nextElementSibling;
        if (itemdescription.style.display === "block") {
            itemdescription.style.display = "none";
        } else {
            itemdescription.style.display = "block";
        }
    });
}