// Compat shim: map legacy sweetalert v1 signatures to sweetalert2.
// Legacy form 1: swal('title', 'text', 'type')
// Legacy form 2: swal({...opts}, function(isConfirm) {...})
// sweetalert2 returns a Promise from .fire(); we translate the callback.
// The UMD bundle exposes the API as window.Sweetalert2 — alias it as Swal for
// idiomatic use and define window.swal for the legacy call sites.
(function () {
    var Swal = window.Sweetalert2;
    if (!Swal) return;
    window.Swal = Swal;
    window.swal = function (arg1, arg2, arg3) {
        if (typeof arg1 === 'object' && typeof arg2 === 'function') {
            var cb = arg2;
            return Swal.fire(arg1).then(function (result) {
                cb(result.isConfirmed);
            });
        }
        return Swal.fire(arg1, arg2, arg3);
    };
})();
