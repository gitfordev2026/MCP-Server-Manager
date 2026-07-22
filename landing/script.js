/**
 * MCP Manager Landing Page JavaScript
 * Includes canvas particles, SVG flow paths, mouse parallax, scroll reveals,
 * navbar effects, mobile menu, and interactive hover animations.
 * 
 * Performance prioritized: requestAnimationFrame, IntersectionObserver, GPU accelerated transforms.
 */

// 1. Reduced Motion Check
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 2. Canvas Particle Network
class ParticleNetwork {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        
        this.ctx = this.canvas.getContext('2d');
        this.ambientParticles = [];
        this.flowParticles = [];
        this.isRunning = false;
        
        // Colors for flow particles
        this.flowColors = ['#3b82f6', '#06b6d4', '#8b5cf6'];
        
        // Settings
        this.ambientCount = 80;
        this.flowCount = 25;
        this.maxDistance = 150;
        
        // Bind methods
        this.resize = this.resize.bind(this);
        this.animate = this.animate.bind(this);
        
        this.init();
    }
    
    init() {
        if (prefersReducedMotion) return;
        
        this.resize();
        window.addEventListener('resize', this.debounce(this.resize, 200));
        
        this.createParticles();
        
        this.isRunning = true;
        requestAnimationFrame(this.animate);
    }
    
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    resize() {
        const parent = this.canvas.parentElement;
        const width = parent.clientWidth;
        const height = parent.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        
        // CSS dimensions
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        
        // Scale context
        this.ctx.scale(dpr, dpr);
        
        this.width = width;
        this.height = height;
        
        // Center point (hub)
        this.centerX = width / 2;
        this.centerY = height / 2;
    }
    
    createParticles() {
        this.ambientParticles = [];
        this.flowParticles = [];
        
        // Create ambient particles
        for (let i = 0; i < this.ambientCount; i++) {
            this.ambientParticles.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                size: Math.random() * 1.5 + 0.5,
                opacity: Math.random() * 0.15 + 0.05
            });
        }
        
        // Create flow particles
        for (let i = 0; i < this.flowCount; i++) {
            this.spawnFlowParticle();
        }
    }
    
    spawnFlowParticle(p = null) {
        // Spawn from random edge
        const edge = Math.floor(Math.random() * 4);
        let x, y;
        
        if (edge === 0) { // Top
            x = Math.random() * this.width;
            y = -10;
        } else if (edge === 1) { // Right
            x = this.width + 10;
            y = Math.random() * this.height;
        } else if (edge === 2) { // Bottom
            x = Math.random() * this.width;
            y = this.height + 10;
        } else { // Left
            x = -10;
            y = Math.random() * this.height;
        }
        
        const targetX = this.centerX + (Math.random() - 0.5) * 100;
        const targetY = this.centerY + (Math.random() - 0.5) * 100;
        
        const angle = Math.atan2(targetY - y, targetX - x);
        const speed = Math.random() * 1 + 0.5;
        
        const particle = p || {};
        particle.x = x;
        particle.y = y;
        particle.vx = Math.cos(angle) * speed;
        particle.vy = Math.sin(angle) * speed;
        particle.size = Math.random() * 2 + 1;
        particle.color = this.flowColors[Math.floor(Math.random() * this.flowColors.length)];
        particle.life = 1.0;
        particle.decay = Math.random() * 0.005 + 0.002;
        
        if (!p) {
            this.flowParticles.push(particle);
        }
        
        return particle;
    }
    
    drawAmbient(p) {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
        this.ctx.fill();
    }
    
    drawFlow(p) {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        this.ctx.fillStyle = p.color;
        
        // Shadow for subtle glow
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = p.color;
        
        this.ctx.globalAlpha = p.life;
        this.ctx.fill();
        
        // Reset shadow and alpha
        this.ctx.shadowBlur = 0;
        this.ctx.globalAlpha = 1.0;
    }
    
    drawConnections() {
        const allParticles = [...this.ambientParticles, ...this.flowParticles];
        
        this.ctx.lineWidth = 1;
        
        for (let i = 0; i < allParticles.length; i++) {
            for (let j = i + 1; j < allParticles.length; j++) {
                const p1 = allParticles[i];
                const p2 = allParticles[j];
                
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < this.maxDistance) {
                    // Line opacity based on distance
                    let opacity = (1 - dist / this.maxDistance) * 0.08;
                    
                    // If connecting to a flow particle, use its life for opacity
                    if (p1.life !== undefined) opacity *= p1.life;
                    if (p2.life !== undefined) opacity *= p2.life;
                    
                    this.ctx.beginPath();
                    this.ctx.moveTo(p1.x, p1.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    
                    // Slightly blue/purple tint for connections
                    this.ctx.strokeStyle = `rgba(139, 92, 246, ${opacity})`;
                    this.ctx.stroke();
                }
            }
        }
    }
    
    update() {
        // Update ambient
        for (const p of this.ambientParticles) {
            p.x += p.vx;
            p.y += p.vy;
            
            // Wrap around
            if (p.x < 0) p.x = this.width;
            if (p.x > this.width) p.x = 0;
            if (p.y < 0) p.y = this.height;
            if (p.y > this.height) p.y = 0;
        }
        
        // Update flow
        for (let i = 0; i < this.flowParticles.length; i++) {
            const p = this.flowParticles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;
            
            // If near center or dead, respawn
            const dx = p.x - this.centerX;
            const dy = p.y - this.centerY;
            const distToCenter = Math.sqrt(dx * dx + dy * dy);
            
            if (p.life <= 0 || distToCenter < 50) {
                this.spawnFlowParticle(p);
            }
        }
    }
    
    animate() {
        if (!this.isRunning) return;
        
        // Use a solid color slightly darker than slate-950 for trail effect
        // or just clear if we want crisp lines
        this.ctx.fillStyle = '#020617';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        this.update();
        
        // Draw components
        for (const p of this.ambientParticles) this.drawAmbient(p);
        this.drawConnections(); // Draw connections behind flow particles
        for (const p of this.flowParticles) this.drawFlow(p);
        
        requestAnimationFrame(this.animate);
    }
}

// 3. SVG Flow Path Generator
class FlowPathGenerator {
    constructor(svgId) {
        this.svg = document.getElementById(svgId);
        this.cards = document.querySelectorAll('.app-card');
        this.hub = document.getElementById('central-hub');
        
        if (!this.svg || !this.hub || this.cards.length === 0) return;
        
        // Bind methods
        this.generate = this.generate.bind(this);
        
        // Delay initial generation slightly to ensure layout is complete
        setTimeout(() => {
            this.generate();
            window.addEventListener('resize', this.debounce(this.generate, 200));
        }, 100);
    }
    
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    generate() {
        // Clear existing SVG contents
        this.svg.innerHTML = '';
        
        const isMobile = window.innerWidth < 768;
        if (isMobile) return; // Skip on mobile for performance and visual clarity
        
        // Get hero bounding rect for offset calculations
        const heroRect = document.getElementById('hero').getBoundingClientRect();
        
        // Hub center
        const hubRect = this.hub.getBoundingClientRect();
        const hubX = hubRect.left + hubRect.width / 2 - heroRect.left;
        const hubY = hubRect.top + hubRect.height / 2 - heroRect.top;
        
        // Generate defs for gradients
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        this.svg.appendChild(defs);
        
        this.cards.forEach((card, index) => {
            // Get card center
            const cardRect = card.getBoundingClientRect();
            
            // If card is not visible or zero dimensions, skip
            if (cardRect.width === 0 || cardRect.height === 0) return;
            
            const cardX = cardRect.left + cardRect.width / 2 - heroRect.left;
            const cardY = cardRect.top + cardRect.height / 2 - heroRect.top;
            
            const glowColor = getComputedStyle(card).getPropertyValue('--glow').trim() || '#3b82f6';
            
            // Create gradient
            const gradId = `flow-grad-${index}`;
            const gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
            gradient.setAttribute("id", gradId);
            gradient.setAttribute("x1", "0%");
            gradient.setAttribute("y1", "0%");
            gradient.setAttribute("x2", "100%");
            gradient.setAttribute("y2", "100%");
            
            const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
            stop1.setAttribute("offset", "0%");
            stop1.setAttribute("stop-color", glowColor);
            stop1.setAttribute("stop-opacity", "0");
            
            const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
            stop2.setAttribute("offset", "100%");
            stop2.setAttribute("stop-color", glowColor);
            stop2.setAttribute("stop-opacity", "1");
            
            gradient.appendChild(stop1);
            gradient.appendChild(stop2);
            defs.appendChild(gradient);
            
            // Calculate control point for curved path
            // We want it to bow outward slightly
            const midX = (cardX + hubX) / 2;
            const midY = (cardY + hubY) / 2;
            
            // Calculate perpendicular vector for control point
            const dx = hubX - cardX;
            const dy = hubY - cardY;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            // Normalize and rotate 90 degrees
            const perpX = -dy / dist;
            const perpY = dx / dist;
            
            // Offset magnitude based on index to give variety
            const offsetMag = dist * 0.2 * (index % 2 === 0 ? 1 : -1);
            
            const cpX = midX + perpX * offsetMag;
            const cpY = midY + perpY * offsetMag;
            
            // Create path
            const pathId = `path-${index}`;
            const pathData = `M ${cardX} ${cardY} Q ${cpX} ${cpY} ${hubX} ${hubY}`;
            
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("id", pathId);
            path.setAttribute("d", pathData);
            path.setAttribute("stroke", `url(#${gradId})`);
            path.setAttribute("stroke-width", "1");
            path.setAttribute("fill", "none");
            path.setAttribute("opacity", "0.15");
            path.setAttribute("stroke-dasharray", "4 8");
            path.classList.add("flow-path");
            
            this.svg.appendChild(path);
            
            if (!prefersReducedMotion) {
                // Add animated dot travelling along path
                const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                dot.setAttribute("r", "2");
                dot.setAttribute("fill", glowColor);
                dot.setAttribute("opacity", "0.6");
                
                // Add shadow/glow filter to dot
                dot.style.filter = `drop-shadow(0 0 3px ${glowColor})`;
                
                const animateMotion = document.createElementNS("http://www.w3.org/2000/svg", "animateMotion");
                const duration = Math.random() * 4 + 4; // 4-8 seconds
                animateMotion.setAttribute("dur", `${duration}s`);
                animateMotion.setAttribute("repeatCount", "indefinite");
                
                const mpath = document.createElementNS("http://www.w3.org/2000/svg", "mpath");
                mpath.setAttribute("href", `#${pathId}`);
                
                animateMotion.appendChild(mpath);
                dot.appendChild(animateMotion);
                this.svg.appendChild(dot);
            }
        });
    }
}

// 4. Mouse Parallax System
class ParallaxSystem {
    constructor() {
        if (prefersReducedMotion || window.innerWidth < 768) return;
        
        this.hero = document.getElementById('hero');
        this.cards = document.querySelectorAll('.app-card');
        this.hub = document.getElementById('central-hub');
        this.tools = document.querySelectorAll('.tool-pill');
        
        if (!this.hero) return;
        
        this.mouseX = 0;
        this.mouseY = 0;
        this.targetX = 0;
        this.targetY = 0;
        
        // Element states — use CSS custom properties for cards so we don't
        // override the CSS float keyframe animation that sets `transform`.
        this.cardItems = [];
        this.directItems = [];
        
        this.cards.forEach((card, index) => {
            this.cardItems.push({
                el: card,
                factor: 15 * (1 - (index % 3) * 0.2)
            });
        });
        
        // Hub has no CSS keyframe, so we can use transform directly
        if (this.hub) {
            this.directItems.push({
                el: this.hub,
                x: 0, y: 0,
                factor: -5
            });
        }
        
        this.onMouseMove = this.onMouseMove.bind(this);
        this.animate = this.animate.bind(this);
        
        this.hero.addEventListener('mousemove', this.onMouseMove, { passive: true });
        
        this.isRunning = true;
        requestAnimationFrame(this.animate);
    }
    
    onMouseMove(e) {
        const rect = this.hero.getBoundingClientRect();
        this.targetX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.targetY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    }
    
    animate() {
        if (!this.isRunning) return;
        
        // Lerp mouse pos
        this.mouseX += (this.targetX - this.mouseX) * 0.05;
        this.mouseY += (this.targetY - this.mouseY) * 0.05;
        
        // For cards: offset position via margin so CSS float animation isn't overridden
        for (const item of this.cardItems) {
            const tx = this.mouseX * item.factor;
            const ty = this.mouseY * item.factor;
            item.el.style.marginLeft = `${tx}px`;
            item.el.style.marginTop = `${ty}px`;
        }
        
        // For direct items (hub): use translate3d
        for (const item of this.directItems) {
            const tx = this.mouseX * item.factor;
            const ty = this.mouseY * item.factor;
            item.el.style.transform = `translate(-50%, -50%) translate3d(${tx}px, ${ty}px, 0)`;
        }
        
        requestAnimationFrame(this.animate);
    }
}

// 5. Scroll Reveal System
class ScrollReveal {
    constructor() {
        this.elements = document.querySelectorAll('[data-reveal]');
        if (this.elements.length === 0) return;
        
        if (prefersReducedMotion) {
            this.elements.forEach(el => el.classList.add('revealed'));
            return;
        }
        
        this.observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    obs.unobserve(entry.target);
                    
                    // Stagger children if needed (e.g. for grid items)
                    const children = entry.target.querySelectorAll('.pipeline-step, .sec-card, .client-card');
                    if (children.length > 0) {
                        children.forEach((child, idx) => {
                            child.style.transitionDelay = `${idx * 0.1}s`;
                            // Force reflow
                            void child.offsetWidth;
                            child.classList.add('revealed-child');
                        });
                    }
                }
            });
        }, {
            threshold: 0.15,
            rootMargin: '0px 0px -50px 0px'
        });
        
        this.elements.forEach(el => this.observer.observe(el));
    }
}

// 6. Navbar Scroll Effect & Active Links
class NavbarEffects {
    constructor() {
        this.navbar = document.getElementById('navbar');
        this.navLinks = document.querySelectorAll('.nav-link');
        this.sections = document.querySelectorAll('section[id]');
        
        if (!this.navbar) return;
        
        this.onScroll = this.onScroll.bind(this);
        window.addEventListener('scroll', this.onScroll, { passive: true });
        this.onScroll(); // Initial check
        
        // Section observer for active links
        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const id = entry.target.getAttribute('id');
                    this.updateActiveLink(id);
                }
            });
        }, {
            threshold: 0.2, // Trigger when 20% visible
            rootMargin: '-80px 0px 0px 0px' // Offset navbar height
        });
        
        this.sections.forEach(sec => this.observer.observe(sec));
    }
    
    onScroll() {
        if (window.scrollY > 50) {
            this.navbar.classList.add('scrolled');
        } else {
            this.navbar.classList.remove('scrolled');
        }
    }
    
    updateActiveLink(id) {
        this.navLinks.forEach(link => {
            if (link.getAttribute('href') === `#${id}`) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }
}

// 7. Smooth Scroll
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const target = document.querySelector(targetId);
            if (target) {
                e.preventDefault();
                
                // Offset for navbar
                const navbarHeight = 80;
                const targetPosition = target.getBoundingClientRect().top + window.scrollY;
                const offsetPosition = targetPosition - navbarHeight;
                
                window.scrollTo({
                    top: offsetPosition,
                    behavior: prefersReducedMotion ? 'auto' : 'smooth'
                });
            }
        });
    });
}

// 8. Mobile Menu
function initMobileMenu() {
    const toggle = document.getElementById('mobile-toggle');
    const navLinks = document.getElementById('nav-links');
    
    if (!toggle || !navLinks) return;
    
    toggle.addEventListener('click', () => {
        toggle.classList.toggle('active');
        navLinks.classList.toggle('open');
    });
    
    // Close on link click
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            toggle.classList.remove('active');
            navLinks.classList.remove('open');
        });
    });
    
    // Close on scroll
    window.addEventListener('scroll', () => {
        if (navLinks.classList.contains('open')) {
            toggle.classList.remove('active');
            navLinks.classList.remove('open');
        }
    }, { passive: true });
}

// 9. Button Hover Effects
function initButtonEffects() {
    const buttons = document.querySelectorAll('.cta-primary, .nav-cta, .cta-secondary');
    
    if (prefersReducedMotion) return;
    
    buttons.forEach(btn => {
        // Magnetic effect
        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const deltaX = (x - centerX) / centerX;
            const deltaY = (y - centerY) / centerY;
            
            // Transform container
            btn.style.transform = `translate3d(${deltaX * 4}px, ${deltaY * 4}px, 0)`;
        });
        
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'translate3d(0, 0, 0)';
        });
        
        // Ripple effect on click
        btn.addEventListener('click', function(e) {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const ripple = document.createElement('span');
            ripple.className = 'ripple';
            ripple.style.left = `${x}px`;
            ripple.style.top = `${y}px`;
            
            // Add some inline CSS for the ripple if not in stylesheet
            ripple.style.position = 'absolute';
            ripple.style.borderRadius = '50%';
            ripple.style.background = 'rgba(255, 255, 255, 0.4)';
            ripple.style.transform = 'scale(0) translate(-50%, -50%)';
            ripple.style.transformOrigin = 'top left';
            ripple.style.width = '100px';
            ripple.style.height = '100px';
            ripple.style.pointerEvents = 'none';
            ripple.style.transition = 'transform 0.6s ease-out, opacity 0.6s ease-out';
            
            btn.style.position = btn.style.position || 'relative';
            btn.style.overflow = 'hidden'; // Ensure ripple doesn't overflow
            
            btn.appendChild(ripple);
            
            // Force reflow
            void ripple.offsetWidth;
            
            ripple.style.transform = 'scale(3) translate(-50%, -50%)';
            ripple.style.opacity = '0';
            
            setTimeout(() => {
                if (ripple.parentNode) {
                    ripple.parentNode.removeChild(ripple);
                }
            }, 600);
        });
    });
}

// 10. Card Tilt Effect
function initCardTilt() {
    if (prefersReducedMotion || window.innerWidth < 768) return;
    
    const cards = document.querySelectorAll('.sec-card, .pipeline-step, .client-card');
    
    cards.forEach(card => {
        // Set perspective on parent or card
        card.style.transformStyle = 'preserve-3d';
        card.style.transition = 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left; // x position within the element
            const y = e.clientY - rect.top;  // y position within the element
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = ((y - centerY) / centerY) * -3; // Max 3 deg
            const rotateY = ((x - centerX) / centerX) * 3;
            
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
            
            // Adjust border glow position if using a custom property
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
            card.style.removeProperty('--mouse-x');
            card.style.removeProperty('--mouse-y');
        });
    });
}

// 11. Initialization
document.addEventListener('DOMContentLoaded', () => {
    // 1. Init canvas particles
    new ParticleNetwork('hero-canvas');
    
    // 2. Init SVG flows
    new FlowPathGenerator('flow-svg');
    
    // 3. Init mouse parallax
    new ParallaxSystem();
    
    // 4. Init scroll reveals
    new ScrollReveal();
    
    // 5. Init navbar effects
    new NavbarEffects();
    
    // 6. Init smooth scroll
    initSmoothScroll();
    
    // 7. Init mobile menu
    initMobileMenu();
    
    // 8. Init button effects
    initButtonEffects();
    
    // 9. Init card tilts
    initCardTilt();
    
    // Add some helper CSS for dynamic classes added by JS
    const style = document.createElement('style');
    style.textContent = `
        .revealed { opacity: 1 !important; transform: none !important; }
        .revealed-child { opacity: 1 !important; transform: none !important; }
        [data-reveal] { transition: opacity 0.8s ease-out, transform 0.8s ease-out; opacity: 0; transform: translateY(30px); }
        
        .ripple { z-index: 10; }
        
        .nav-link.active { color: #fff; text-shadow: 0 0 10px rgba(255,255,255,0.3); }
        .nav-link.active::after { content: ''; position: absolute; bottom: -5px; left: 0; width: 100%; height: 2px; background: #3b82f6; border-radius: 2px; }
    `;
    document.head.appendChild(style);
});
