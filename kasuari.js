(function() {

var KasuariImage = function(ix, iy, iz, url) {
    this.ix = ix;
    this.iy = iy;
    this.iz = iz;
    this.scale = Math.pow(2, iz);
    this.loaded = false;
    this.url = url;
    this.img = new Image();
    this.onload = undefined;

    this.id = ix + '-' + iy + '-' + iz;

    var self = this;
    this.img.onload = function() {
        self.loaded = true;
        if (self.onload != undefined) {
            self.onload(self);
        }
    };
};

KasuariImage.prototype = {
    init: function() {
        this.img.src = this.url;
    },

    draw: function(ctx, scale) {
        if (!this.loaded) { return; }
        var s = scale * this.scale;
        var dim = 256 * s;
        var x = Math.ceil(this.ix * dim);
        var y = Math.ceil(this.iy * dim);
        var w = Math.ceil(this.img.width * s);
        var h = Math.ceil(this.img.height * s);
        try {
            ctx.drawImage(this.img, x, y, w, h);
        }
        catch (err) {
            // image is removed when this image is about to be rendered
        }
    }
};

var RedrawBucket = function(kasuari) {
    var self = this;
    this.timer = setInterval(function() { self.redraw(); }, 250);
    this.items = [];
    this.kasuari = kasuari;
};

RedrawBucket.prototype = {
    add: function(img) {
        this.items.push(img);
    },

    redraw: function() {
        var items = this.items.slice(0);
        this.items = []; // racing condition possibility

        var level = this.kasuari.zoomLevel;
        var len = items.length;
        var added = false;
        for (var i=0; i<len; i++) {
            var img = items[i];
            if (img.iz == level) {
                var key = img.ix+','+img.iy;
                this.kasuari.images[level][key] = img;
                added = true;
            }
        }

        if (added) {
            this.kasuari.redraw();
        }
    },
};

var Kasuari = function(canvas, config) {
    this.canvas = canvas.get(0);
    this.cw = canvas.width();
    this.ch = canvas.height();
    this.canvas.width = this.cw;
    this.canvas.height = this.ch;
    this.ctx = this.canvas.getContext('2d');

    this.dir = config.imgdir;
    this.ext = config.ext;
    this.zoomLevel = config.zoomLevel;
    this.w = config.w;
    this.h = config.h;

    this.scale = Math.pow(0.5, this.zoomLevel);
    this.tx = 0;
    this.ty = 0;

    this.drag = {x: 0, y: 0, dx: 0, dy: 0, enabled: false};
    this.zooming = {x: 0, y: 0, scale: 0, 
                    dx: 0, dy: 0, dscale: 0, 
                    tx: 0, ty: 0, tscale: 0, 
                    duration: 250,
                    interval: 20,
                    start: new Date(),
                    enabled: false};

    this.clickZoomStep = 2.0;
    this.wheelZoomStep = 2.0;

    this.images = [];

    this.redrawBucket = new RedrawBucket(this);
};

Kasuari.prototype = {
    getURL: function(ix, iy, iz) {
        //return this.dir + '/img-z' + iz + '.x' + ix + '.y' + iy + this.ext;
        return this.dir + '/' + iz + '.' + ix + '.' + iy + this.ext;
    },

    start: function() {
        this.initEventHandlers();
        this.updateImages();
    },

    addImage: function(ix, iy, iz) {
        var url = this.getURL(ix, iy, iz);
        var img = new KasuariImage(ix, iy, iz, url);
        var self = this;
        img.onload = function(img) {
            if (self.images[iz] == undefined) {
                self.images[iz] = {};
            }
            self.redrawBucket.add(img);
        }
        return img;
    },

    redraw: function() {
        this.ctx.clearRect(0, 0, this.cw, this.ch);

        this.ctx.save();
        this.ctx.translate(this.tx, this.ty);

        var len = this.images.length;
        for (var i=len-1; i>=0; i--) {
            var images = this.images[i];
            if (images != undefined) {
                for (var key in images) {
                    images[key].draw(this.ctx, this.scale);
                }
            }
        }

        this.ctx.restore();
    },

    updateZoomLevel: function() {
        var zoomLevel = Math.floor(Math.log(1/this.scale) / Math.log(2));
        if (zoomLevel < 0) { zoomLevel = 0; }
        this.zoomLevel = zoomLevel;
    },

    getVisibleImages: function(level) {
        var tx = this.tx / this.scale;
        var ty = this.ty / this.scale;
        var cw = this.cw / this.scale;
        var ch = this.ch / this.scale;
        var size = 256 * Math.pow(2, level);

        var x0 = Math.floor(-tx / size) - 1;
        var y0 = Math.floor(-ty / size) - 1;
        var x1 = Math.ceil((-tx + cw) / size) + 1;
        var y1 = Math.ceil((-ty + ch) / size) + 1;

        var items = {};

        var x, y;
        for (x=x0; x<=x1; x++) {
            for (y=y0; y<=y1; y++) {
                var px = x * size;
                var py = y * size;

                if ((x < 0) || (y < 0)) { continue; }
                if ((px > this.w) || (py > this.h)) { continue; }
                
                items[x+','+y] = [x, y];
            }
        }

        return items;
    },

    updateVisibleImages: function(level, add) {
        var items = this.getVisibleImages(level);

        if (this.images[level] == undefined) {
            this.images[level] = {};
        }

        // delete unused image
        for (var key in this.images[level]) {
            if (!(key in items)) {
                delete this.images[level][key];
            }
        }

        // add new image
        if ((add == undefined) || add) {
            var images = this.images[level];
            for (var key in items) {
                var data = items[key];
                if (!(data in images)) {
                    this.addImage(data[0], data[1], level).init();
                }
            }
        }
    },

    updateImages: function() {
        var len = this.images.length;
        for (var i=0; i<len; i++) {
            if (i != this.zoomLevel) {
                this.updateVisibleImages(i, false);
            }
        }
        this.updateVisibleImages(this.zoomLevel);
    },

    /* Event handlers */

    initEventHandlers: function() {
        var canvas = $(this.canvas);
        var self = this;
        canvas.mousedown(function(e) {
            self._mousedown(e);
        });
        canvas.mousemove(function(e) {
            self._mousemove(e);
        });
        canvas.mouseup(function(e) {
            self._mouseup(e);
        });
        canvas.dblclick(function(e) {
            self._dblclick(e);
        });
        canvas.mousewheel(function(e, d) {
            self._mousewheel(e, d);
        });
    },
    _mousedown: function(e) {
        this.drag.x = e.clientX;
        this.drag.y = e.clientY;
        this.drag.dx = 0;
        this.drag.dy = 0;
        this.drag.enabled = true;
    },
    _mouseup: function(e) {
        this.drag.enabled = false;
    },
    _mousemove: function(e) {
        if (this.drag.enabled) {
            var x = e.clientX;
            var y = e.clientY;
            this.drag.dx = x - this.drag.x;
            this.drag.dy = y - this.drag.y;
            this.drag.x = x;
            this.drag.y = y;

            this.tx += this.drag.dx;
            this.ty += this.drag.dy;
            // this.updateVisibleImages(this.zoomLevel);
            this.updateImages();
            this.redraw();
        };
    },
    _dblclick: function(e) {
        var canvas = $(this.canvas);
        var pos = canvas.offset();
        var x = e.pageX - pos.left;
        var y = e.pageY - pos.top;
        this.zoom(x, y, this.clickZoomStep);
    },
    _mousewheel: function(e, d) {
        var pos = $(this.canvas).offset();
        var x = e.pageX - pos.left;
        var y = e.pageY - pos.top;
        if (d > 0) {
            this.zoom(x, y, this.wheelZoomStep);
        }
        else {
            this.zoom(x, y, 1/this.wheelZoomStep);
        }
        return false;
    },

    /* Navigation */

    zoom: function(x, y, scale) {
        if (this.zooming.enabled) { return; }
        this.zooming.enabled = true;

        this.zooming.x = this.tx;
        this.zooming.y = this.ty;
        this.zooming.scale = this.scale;

        this.zooming.tx = Math.floor(x - (x - this.tx) * scale);
        this.zooming.ty = Math.floor(y - (y - this.ty) * scale);
        this.zooming.tscale = this.scale * scale;

        this.zooming.dx = this.zooming.tx - this.zooming.x;
        this.zooming.dy = this.zooming.ty - this.zooming.y;
        this.zooming.dscale = this.zooming.tscale - this.zooming.scale;

        this.zooming.start = new Date();
        var self = this;
        setTimeout(function() { self._zoomStep(); },
                    this.zooming.interval);
    },

    _zoomStep: function() {
        var tnow = new Date();
        var tdelta = tnow - this.zooming.start;
        var now = tdelta / this.zooming.duration;

        this.tx = this.zooming.x + this.zooming.dx * now;
        this.ty = this.zooming.y + this.zooming.dy * now;
        this.scale = this.zooming.scale + this.zooming.dscale * now;

        var a = this.tx;
        if (now >= 1.0) {
            this.tx = this.zooming.tx;
            this.ty = this.zooming.ty;
            this.scale = this.zooming.tscale;
        }
        var b = this.tx;

        if (now < 1.0) {
            this.redraw();
            var self = this;
            setTimeout(function() { self._zoomStep(); }, 
                       this.zooming.interval);
        }
        else {
            this.zooming.enabled = false;
            this.updateZoomLevel();
            this.updateImages();
            this.redraw();
        }
    },
};

this.Kasuari = Kasuari;

})();
