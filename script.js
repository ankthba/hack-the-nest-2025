// JavaScript code goes here

//intro stuff
document.addEventListener('DOMContentLoaded', function() {
    const h2 = document.getElementById('reveal-h2');
    function revealH2OnScroll() {
        if (window.scrollY > 400) {
            h2.style.opacity = 1;
            window.removeEventListener('scroll', revealH2OnScroll);
        }
    }
    window.addEventListener('scroll', revealH2OnScroll);
});

document.addEventListener('DOMContentLoaded', function() {
    const p = document.getElementById('reveal-p');
    function revealpOnScroll() {
        if (window.scrollY > 400) {
            p.style.opacity = 1;
            window.removeEventListener('scroll', revealpOnScroll);
        }
    }
    window.addEventListener('scroll', revealpOnScroll);
});

//problem & solution stuff
document.addEventListener('DOMContentLoaded', function() {
    const h2 = document.getElementById('reveal-title');
    function revealtitleOnScroll() {
        if (window.scrollY > 800) {
            h2.style.opacity = 1;
            window.removeEventListener('scroll', revealtitleOnScroll);
        }
    }
    window.addEventListener('scroll', revealtitleOnScroll);
});

document.addEventListener('DOMContentLoaded', function() {
    const p = document.getElementById('reveal-text');
    function revealtextOnScroll() {
        if (window.scrollY > 800) {
            p.style.opacity = 1;
            window.removeEventListener('scroll', revealtextOnScroll);
        }
    }
    window.addEventListener('scroll', revealtextOnScroll);
});