// The in-app browser for iOS.
//
// Desktop hands a page to a Tauri child webview and Android hands one over from Kotlin. iOS has
// neither, so this is the counterpart to BrowserBridge.kt: a WKWebView per tab, parented to the
// window the Rust side already put on screen, positioned from the rects the frontend measures.
//
// The frontend asks for nothing new. It looks for `window.__nuraBrowser`, and everything it can
// ask of it is the interface in src/core/browser.ts. This installs that object on the host webview
// and answers it, so the browser tab the dashboard already knows how to draw simply appears.

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>
#import <objc/runtime.h>

static NSString *const kSole = @"sole";

static NSString *const kDesktopAgent =
    @"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    @"Chrome/140.0.0.0 Safari/537.36";

/// The name the host webview posts bridge calls to, and the name a visited page posts provider
/// requests to. They are separate handlers on separate content controllers: the host's controller
/// belongs to the wallet, a page's controller belongs to that page alone.
static NSString *const kHostChannel = @"nuraBrowser";
static NSString *const kPageChannel = @"nuraProvider";

/// The floating mouse's side: the same number as `size` in src/ui/mouse.tsx.
static const CGFloat kMouseSize = 40;

/// The wallet's logo as the mouse wears it, kept at the foot of this file.
static NSString *NuraLogo(void);

/// The ink the status bar is drawn in, as the wallet last asked for it. `inkBars:` writes it, and
/// the answer it gives the root view controller reads it.
static UIStatusBarStyle NuraBarStyle = UIStatusBarStyleDefault;

@interface NuraBrowserBridge : NSObject <WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate>

@property (nonatomic, weak) WKWebView *host;
@property (nonatomic, strong) NSMutableDictionary<NSString *, WKWebView *> *pages;
@property (nonatomic, strong) NSString *dappScript;
@property (nonatomic, assign) BOOL desktop;

/// The floating mouse, once something has asked for it, and what it wears. The two are kept apart
/// because the wallet says what it wears before it asks for it to be shown.
@property (nonatomic, strong) UIImageView *mouse;
@property (nonatomic, strong) NSString *mouseIcon;

/// The mouse's menu while it is open: a layer over every page, just under the mouse, holding its
/// buttons. A press on the layer outside them closes it, and the page under it is never touched.
@property (nonatomic, strong) UIView *menu;
@property (nonatomic, strong) NSArray<NSString *> *menuKeys;

@end

@implementation NuraBrowserBridge

+ (instancetype)shared {
    static NuraBrowserBridge *shared = nil;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        shared = [[NuraBrowserBridge alloc] init];
    });
    return shared;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _pages = [NSMutableDictionary dictionary];
        _dappScript = @"";
        _desktop = NO;
        _mouseIcon = @"logo";
    }
    return self;
}

#pragma mark - origin

/// The origin a request is attributed to, taken from the webview that sent it and from nothing
/// else. A page can put whatever it likes in its payload; what it cannot do is change the URL it
/// is actually loaded from, so that is what the wallet is told. Anything that is not a web page —
/// about:blank, a file, a custom scheme — has no origin and is refused rather than guessed at.
- (NSString *)originOf:(NSURL *)url {
    if (url == nil) {
        return @"";
    }

    NSString *scheme = url.scheme.lowercaseString;

    if (![scheme isEqualToString:@"http"] && ![scheme isEqualToString:@"https"]) {
        return @"";
    }

    NSString *host = url.host;

    if (host.length == 0) {
        return @"";
    }

    NSNumber *port = url.port;
    NSInteger standard = [scheme isEqualToString:@"https"] ? 443 : 80;

    if (port == nil || port.integerValue == standard) {
        return [NSString stringWithFormat:@"%@://%@", scheme, host];
    }

    return [NSString stringWithFormat:@"%@://%@:%@", scheme, host, port];
}

#pragma mark - json

- (NSString *)encode:(id)value {
    if (value == nil || ![NSJSONSerialization isValidJSONObject:value]) {
        return @"null";
    }

    NSError *error = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:value
                                                   options:(NSJSONWritingOptions)0
                                                     error:&error];
    if (data == nil) {
        return @"null";
    }
    return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
}

/// A JSON string literal, so a payload can be handed to the host as one argument without the page
/// being able to end the string and write its own code after it.
/// A JSON string literal. A bare string is not a valid top-level JSON value, so this asks for
/// fragments rather than handing NSJSONSerialization something it throws on.
- (NSString *)quote:(NSString *)text {
    NSError *error = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:(text ?: @"")
                                                   options:NSJSONWritingFragmentsAllowed
                                                     error:&error];
    if (data == nil) {
        return @"\"\"";
    }
    return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
}

- (void)evalOnHost:(NSString *)script {
    WKWebView *host = self.host;
    if (host == nil) {
        return;
    }
    dispatch_async(dispatch_get_main_queue(), ^{
        [host evaluateJavaScript:script completionHandler:nil];
    });
}

#pragma mark - state

- (void)publish:(NSString *)identifier view:(WKWebView *)view loading:(BOOL)loading progress:(double)progress {
    NSDictionary *state = @{
        @"id": identifier ?: @"",
        @"url": view.URL.absoluteString ?: @"",
        @"title": view.title ?: @"",
        @"canBack": @(view.canGoBack),
        @"canForward": @(view.canGoForward),
        @"loading": @(loading),
        @"progress": @((NSInteger)(progress * 100))
    };

    NSString *script = [NSString stringWithFormat:
        @"window.__nuraBrowserState && window.__nuraBrowserState(%@)", [self encode:state]];

    [self evalOnHost:script];
}

#pragma mark - page construction

- (UIView *)container {
    UIWindow *window = nil;

    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
        if ([scene isKindOfClass:UIWindowScene.class] && scene.activationState == UISceneActivationStateForegroundActive) {
            for (UIWindow *candidate in ((UIWindowScene *)scene).windows) {
                if (candidate.isKeyWindow) {
                    window = candidate;
                    break;
                }
            }
        }
        if (window != nil) {
            break;
        }
    }

    return window;
}

- (void)applyAgent:(WKWebView *)view {
    view.customUserAgent = self.desktop ? kDesktopAgent : nil;
}

- (WKWebView *)build:(NSString *)identifier {
    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    configuration.allowsInlineMediaPlayback = YES;

    WKUserContentController *controller = [[WKUserContentController alloc] init];

    // The transport the injected script looks for on mobile. Android hands the page a Kotlin
    // object named __nuraEthereum; this is the same name over the webkit message channel, so the
    // script's existing branch works unchanged. It forwards a payload and nothing else - the label
    // and the origin are decided natively, from the webview the message arrives on.
    NSString *transport =
        @"(function(){"
        @"  if (window.__nuraEthereum) { return; }"
        @"  window.__nuraEthereum = { request: function(body){"
        @"    window.webkit.messageHandlers.nuraProvider.postMessage(String(body));"
        @"  }};"
        @"})();";

    [controller addUserScript:[[WKUserScript alloc] initWithSource:transport
                                                     injectionTime:WKUserScriptInjectionTimeAtDocumentStart
                                                  forMainFrameOnly:NO]];

    // The provider script goes in at document start, before the page runs anything of its own, so
    // a dApp finds the wallet already there rather than racing it.
    if (self.dappScript.length > 0) {
        WKUserScript *script = [[WKUserScript alloc] initWithSource:self.dappScript
                                                      injectionTime:WKUserScriptInjectionTimeAtDocumentStart
                                                   forMainFrameOnly:NO];
        [controller addUserScript:script];
    }

    [controller addScriptMessageHandler:self name:kPageChannel];

    configuration.userContentController = controller;

    WKWebView *view = [[WKWebView alloc] initWithFrame:CGRectZero configuration:configuration];
    view.navigationDelegate = self;
    view.UIDelegate = self;
    view.opaque = YES;
    view.backgroundColor = UIColor.whiteColor;
    view.allowsBackForwardNavigationGestures = YES;

    [self applyAgent:view];

    [view addObserver:self forKeyPath:@"estimatedProgress" options:NSKeyValueObservingOptionNew context:nil];
    [view addObserver:self forKeyPath:@"title" options:NSKeyValueObservingOptionNew context:nil];

    objc_setAssociatedObject(view, @selector(build:), identifier, OBJC_ASSOCIATION_RETAIN_NONATOMIC);

    return view;
}

- (NSString *)identifierOf:(WKWebView *)view {
    return objc_getAssociatedObject(view, @selector(build:)) ?: @"";
}

- (void)layout:(WKWebView *)view x:(double)x y:(double)y width:(double)width height:(double)height {
    view.frame = CGRectMake(x, y, width, height);
}

#pragma mark - bridge surface

- (void)openTab:(NSString *)identifier
            url:(NSString *)url
        visible:(BOOL)visible
              x:(double)x
              y:(double)y
          width:(double)width
         height:(double)height {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSURL *target = [NSURL URLWithString:url];
        NSString *scheme = target.scheme.lowercaseString;

        if (![scheme isEqualToString:@"http"] && ![scheme isEqualToString:@"https"]) {
            return;
        }


        WKWebView *view = self.pages[identifier];

        if (view == nil) {
            view = [self build:identifier];
            self.pages[identifier] = view;

            UIView *container = [self container];
            if (container == nil) {
                [self.pages removeObjectForKey:identifier];
                return;
            }
            [container addSubview:view];

            // UIKit hands a touch to whichever view was added last, so a page added after the
            // mouse would cover it and take its presses too. The mouse, and a menu open under it, go back on top.
            if (self.menu.superview == container) {
                [container bringSubviewToFront:self.menu];
            }
            if (self.mouse.superview == container) {
                [container bringSubviewToFront:self.mouse];
            }
        }

        [self layout:view x:x y:y width:width height:height];
        view.hidden = !visible;

        [view loadRequest:[NSURLRequest requestWithURL:target]];
    });
}

- (void)boundsTab:(NSString *)identifier x:(double)x y:(double)y width:(double)width height:(double)height {
    dispatch_async(dispatch_get_main_queue(), ^{
        WKWebView *view = self.pages[identifier];
        if (view != nil) {
            [self layout:view x:x y:y width:width height:height];
        }
    });
}

- (void)closeTab:(NSString *)identifier {
    dispatch_async(dispatch_get_main_queue(), ^{
        WKWebView *view = self.pages[identifier];
        if (view == nil) {
            return;
        }

        [view.configuration.userContentController removeScriptMessageHandlerForName:kPageChannel];
        [view removeObserver:self forKeyPath:@"estimatedProgress"];
        [view removeObserver:self forKeyPath:@"title"];
        [view stopLoading];
        [view removeFromSuperview];

        [self.pages removeObjectForKey:identifier];
    });
}

- (void)closeAll {
    [self hideMouse];

    for (NSString *identifier in self.pages.allKeys) {
        [self closeTab:identifier];
    }
}

- (void)visibleTab:(NSString *)identifier visible:(BOOL)visible {
    dispatch_async(dispatch_get_main_queue(), ^{
        self.pages[identifier].hidden = !visible;
    });
}

- (void)reloadTab:(NSString *)identifier {
    dispatch_async(dispatch_get_main_queue(), ^{
        [self.pages[identifier] reload];
    });
}

- (void)backTab:(NSString *)identifier {
    dispatch_async(dispatch_get_main_queue(), ^{
        WKWebView *view = self.pages[identifier];
        if (view.canGoBack) {
            [view goBack];
        }
    });
}

- (void)forwardTab:(NSString *)identifier {
    dispatch_async(dispatch_get_main_queue(), ^{
        WKWebView *view = self.pages[identifier];
        if (view.canGoForward) {
            [view goForward];
        }
    });
}

- (void)setDesktopMode:(BOOL)desktop {
    self.desktop = desktop;
    dispatch_async(dispatch_get_main_queue(), ^{
        for (WKWebView *view in self.pages.allValues) {
            [self applyAgent:view];
            [view reload];
        }
    });
}

- (void)setDappScript:(NSString *)script {
    _dappScript = script ?: @"";
}

/// The wallet's answer to a provider request, handed back to the page that asked. `payload` is
/// already JSON from the frontend, so it is placed as a literal rather than re-encoded.
- (void)dappReply:(NSString *)identifier payload:(NSString *)payload {
    dispatch_async(dispatch_get_main_queue(), ^{
        WKWebView *view = self.pages[identifier];
        if (view == nil) {
            return;
        }
        NSString *script = [NSString stringWithFormat:
            @"window.__nuraWalletReply && window.__nuraWalletReply(%@)", [self quote:payload]];
        [view evaluateJavaScript:script completionHandler:nil];
    });
}

- (void)dappEmit:(NSString *)identifier payload:(NSString *)payload {
    dispatch_async(dispatch_get_main_queue(), ^{
        WKWebView *view = self.pages[identifier];
        if (view == nil) {
            return;
        }
        NSString *script = [NSString stringWithFormat:
            @"window.__nuraWalletEvent && window.__nuraWalletEvent(%@)", [self quote:payload]];
        [view evaluateJavaScript:script completionHandler:nil];
    });
}

#pragma mark - mouse

/// What the mouse wears on the wallet, where a press opens the browser: lucide's globe on a tile cut
/// to the logo's shape and colours. Drawn to match MouseFace in src/ui/mouse.tsx, as Android's
/// res/drawable/nura_browser.xml is, so a change to one belongs in all three.
- (UIImage *)browserFace {
    CGSize size = CGSizeMake(kMouseSize, kMouseSize);
    UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc] initWithSize:size];

    return [renderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
        [UIColor.blackColor setFill];
        [[UIBezierPath bezierPathWithRoundedRect:CGRectMake(0, 0, kMouseSize, kMouseSize) cornerRadius:8] fill];

        // The globe is 24 across and sits 8 in from the tile's corner. Its meridian is two arcs of
        // radius 14.5 from pole to pole, 20 apart, so each is centred 10.5 to one side of the axis.
        CGFloat reach = atan2(10.0, 10.5);

        UIBezierPath *globe = [UIBezierPath bezierPathWithOvalInRect:CGRectMake(10, 10, 20, 20)];

        [globe moveToPoint:CGPointMake(20, 10)];
        [globe addArcWithCenter:CGPointMake(30.5, 20) radius:14.5 startAngle:M_PI + reach endAngle:M_PI - reach clockwise:NO];
        [globe addArcWithCenter:CGPointMake(9.5, 20) radius:14.5 startAngle:reach endAngle:-reach clockwise:NO];

        [globe moveToPoint:CGPointMake(10, 20)];
        [globe addLineToPoint:CGPointMake(30, 20)];

        globe.lineWidth = 2;
        globe.lineCapStyle = kCGLineCapRound;
        globe.lineJoinStyle = kCGLineJoinRound;

        [[UIColor colorWithRed:0x22 / 255.0 green:0xB8 / 255.0 blue:0xF5 / 255.0 alpha:1.0] setStroke];
        [globe stroke];
    }];
}

- (UIImage *)logoFace {
    NSData *data = [[NSData alloc] initWithBase64EncodedString:NuraLogo()
                                                       options:NSDataBase64DecodingIgnoreUnknownCharacters];

    return data == nil ? nil : [UIImage imageWithData:data];
}

- (UIImage *)mouseFace {
    return [self.mouseIcon isEqualToString:@"browser"] ? [self browserFace] : [self logoFace];
}

/// Kept inside the window, wherever it is dragged.
- (void)place:(UIView *)view at:(CGPoint)origin {
    UIView *parent = view.superview;

    if (parent == nil) {
        return;
    }

    CGFloat x = MIN(MAX(origin.x, 0), MAX(parent.bounds.size.width - kMouseSize, 0));
    CGFloat y = MIN(MAX(origin.y, 0), MAX(parent.bounds.size.height - kMouseSize, 0));

    view.frame = CGRectMake(x, y, kMouseSize, kMouseSize);
}

/// A press, told to the wallet and to nothing else. The host webview is the only one that hears
/// it, and a page has no way to reach this view, so nothing a site runs can pose as one.
/// It carries the mouse's centre in the wallet's page, which the wallet's own menu is drawn round.
/// A press while the menu is open only closes it.
- (void)mousePressed:(UITapGestureRecognizer *)tap {
    if (self.menu != nil) {
        [self closeMenu];
        return;
    }

    UIView *view = tap.view;
    CGPoint centre = [view.superview convertPoint:view.center toView:self.host];

    [self evalOnHost:[NSString stringWithFormat:@"window.__nuraMouse && window.__nuraMouse('click', %f, %f)",
                                                centre.x, centre.y]];
}

- (void)mouseDragged:(UIPanGestureRecognizer *)pan {
    UIView *view = pan.view;
    UIView *parent = view.superview;

    if (parent == nil) {
        return;
    }

    if (pan.state == UIGestureRecognizerStateBegan) {
        [self closeMenu];
        [self evalOnHost:@"window.__nuraMouse && window.__nuraMouse('move')"];
    }

    CGPoint moved = [pan translationInView:parent];
    CGPoint from = view.frame.origin;

    [pan setTranslation:CGPointZero inView:parent];

    [self place:view at:CGPointMake(from.x + moved.x, from.y + moved.y)];
}

/// The floating mouse: a view of its own on the window, above the wallet and every page, since a
/// page is a view of its own too and nothing the wallet draws in its document reaches over one.
/// It is the counterpart of the ImageView BrowserBridge.kt builds.
- (UIImageView *)buildMouse:(UIView *)container {
    UIImageView *view = [[UIImageView alloc] initWithImage:[self mouseFace]];

    view.userInteractionEnabled = YES;
    view.contentMode = UIViewContentModeScaleAspectFit;

    // Carried along when the window changes shape, in proportion to where it stood, so turning
    // the phone leaves it on screen: in full screen it is the only way back out.
    view.autoresizingMask = UIViewAutoresizingFlexibleLeftMargin | UIViewAutoresizingFlexibleRightMargin |
                            UIViewAutoresizingFlexibleTopMargin | UIViewAutoresizingFlexibleBottomMargin;

    UITapGestureRecognizer *once = [[UITapGestureRecognizer alloc] initWithTarget:self
                                                                           action:@selector(mousePressed:)];

    UIPanGestureRecognizer *drag = [[UIPanGestureRecognizer alloc] initWithTarget:self
                                                                           action:@selector(mouseDragged:)];

    [view addGestureRecognizer:once];
    [view addGestureRecognizer:drag];

    [container addSubview:view];

    [self place:view
             at:CGPointMake((container.bounds.size.width - kMouseSize) / 2, (container.bounds.size.height - kMouseSize) / 2)];

    return view;
}

- (void)showMouse:(double)opacity {
    dispatch_async(dispatch_get_main_queue(), ^{
        UIImageView *view = self.mouse;

        if (view == nil) {
            UIView *container = [self container];

            if (container == nil) {
                return;
            }

            view = [self buildMouse:container];
            self.mouse = view;
        }

        // Never fainter than the wallet's own floor. UIKit stops sending touches to a view that is
        // all but clear, and a mouse nobody can press is no way back out of full screen.
        view.alpha = MIN(MAX(opacity, 0.1), 1.0);
        view.hidden = NO;

        [view.superview bringSubviewToFront:view];
    });
}

- (void)hideMouse {
    dispatch_async(dispatch_get_main_queue(), ^{
        [self dropMenu];

        self.mouse.hidden = YES;
    });
}

#pragma mark - mouse menu

static UIColor *NuraColour(id value) {
    if (![value isKindOfClass:NSString.class]) {
        return UIColor.grayColor;
    }

    NSString *hex = [(NSString *)value stringByTrimmingCharactersInSet:[NSCharacterSet characterSetWithCharactersInString:@"#"]];
    unsigned int rgb = 0;

    if (hex.length != 6 || ![[NSScanner scannerWithString:hex] scanHexInt:&rgb]) {
        return UIColor.grayColor;
    }

    return [UIColor colorWithRed:((rgb >> 16) & 0xFF) / 255.0 green:((rgb >> 8) & 0xFF) / 255.0 blue:(rgb & 0xFF) / 255.0 alpha:1];
}

/// The system's nearest match for each of lucide's icons in glyphMap in src/ui/speeddial.tsx.
- (NSString *)symbolOf:(NSString *)glyph {
    if ([glyph isEqualToString:@"wallet"]) {
        return @"wallet.pass";
    }
    if ([glyph isEqualToString:@"browser"]) {
        return @"globe";
    }
    if ([glyph isEqualToString:@"full"]) {
        return @"arrow.up.left.and.arrow.down.right";
    }
    return @"arrow.down.right.and.arrow.up.left";
}

- (UIImage *)disc:(UIColor *)fill line:(UIColor *)line side:(CGFloat)side {
    UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc] initWithSize:CGSizeMake(side, side)];

    return [renderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
        UIBezierPath *circle = [UIBezierPath bezierPathWithOvalInRect:CGRectMake(0.5, 0.5, side - 1, side - 1)];

        [fill setFill];
        [circle fill];

        if (line != nil) {
            circle.lineWidth = 1;
            [line setStroke];
            [circle stroke];
        }
    }];
}

/// Where a button starts from and goes back to: part-way toward the mouse's centre, and smaller.
static CGAffineTransform NuraTucked(CGPoint spoke) {
    return CGAffineTransformScale(CGAffineTransformMakeTranslation(-spoke.x * 0.6, -spoke.y * 0.6), 0.5, 0.5);
}

/// Lays the menu round the mouse's centre, as src/ui/speeddial.tsx does on the desktop: the first
/// button at twelve o'clock and the rest clockwise, each 10pt clear of the mouse. A mouse too near
/// an edge for the ring steps in until it fits, and stays there.
- (void)openMenu:(NSDictionary *)spec {
    [self dropMenu];

    UIImageView *mouse = self.mouse;
    UIView *container = mouse.superview;

    NSArray *items = [spec[@"items"] isKindOfClass:NSArray.class] ? spec[@"items"] : @[];
    NSDictionary *colors = [spec[@"colors"] isKindOfClass:NSDictionary.class] ? spec[@"colors"] : @{};

    if (mouse == nil || container == nil || mouse.hidden || items.count == 0) {
        return;
    }

    UIColor *surface = NuraColour(colors[@"surface"]);
    UIColor *line = NuraColour(colors[@"line"]);
    UIColor *ink = NuraColour(colors[@"ink"]);
    UIColor *accent = NuraColour(colors[@"accent"]);
    UIColor *onAccent = NuraColour(colors[@"onAccent"]);
    UIColor *muted = [NuraColour(colors[@"muted"]) colorWithAlphaComponent:0.6];

    CGFloat button = 48;
    CGFloat radius = kMouseSize / 2 + 10 + button / 2;
    CGFloat reach = radius + button / 2 + 8;

    CGSize room = container.bounds.size;
    CGFloat cx = MIN(MAX(mouse.center.x, reach), MAX(room.width - reach, reach));
    CGFloat cy = MIN(MAX(mouse.center.y, reach), MAX(room.height - reach, reach));

    mouse.center = CGPointMake(cx, cy);

    UIView *layer = [[UIView alloc] initWithFrame:container.bounds];

    layer.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    layer.backgroundColor = UIColor.clearColor;

    // A button's own tap wins over this one, which only hears the presses that miss them all.
    [layer addGestureRecognizer:[[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(menuMissed:)]];

    [container insertSubview:layer belowSubview:mouse];

    UIImageSymbolConfiguration *weight = [UIImageSymbolConfiguration configurationWithPointSize:18
                                                                                         weight:UIImageSymbolWeightMedium];

    UIImage *rest = [self disc:surface line:line side:button];
    UIImage *pressed = [self disc:accent line:nil side:button];

    NSMutableArray<NSString *> *keys = [NSMutableArray array];
    NSUInteger count = items.count;

    for (NSUInteger index = 0; index < count; index++) {
        NSDictionary *item = [items[index] isKindOfClass:NSDictionary.class] ? items[index] : @{};

        NSString *key = [item[@"key"] isKindOfClass:NSString.class] ? item[@"key"] : @"";
        NSString *label = [item[@"label"] isKindOfClass:NSString.class] ? item[@"label"] : @"";
        NSString *glyph = [item[@"glyph"] isKindOfClass:NSString.class] ? item[@"glyph"] : @"";
        BOOL disabled = [item[@"disabled"] isKindOfClass:NSNumber.class] && [item[@"disabled"] boolValue];

        double angle = -M_PI_2 + index * 2 * M_PI / count;
        CGPoint spoke = CGPointMake(cos(angle) * radius, sin(angle) * radius);

        UIButton *view = [UIButton buttonWithType:UIButtonTypeCustom];
        UIImage *symbol = [UIImage systemImageNamed:[self symbolOf:glyph] withConfiguration:weight];

        view.frame = CGRectMake(cx + spoke.x - button / 2, cy + spoke.y - button / 2, button, button);
        view.tag = (NSInteger)index;

        [view setBackgroundImage:rest forState:UIControlStateNormal];
        [view setBackgroundImage:pressed forState:UIControlStateHighlighted];
        [view setBackgroundImage:rest forState:UIControlStateDisabled];

        [view setImage:[symbol imageWithTintColor:ink renderingMode:UIImageRenderingModeAlwaysOriginal] forState:UIControlStateNormal];
        [view setImage:[symbol imageWithTintColor:onAccent renderingMode:UIImageRenderingModeAlwaysOriginal]
              forState:UIControlStateHighlighted];
        [view setImage:[symbol imageWithTintColor:muted renderingMode:UIImageRenderingModeAlwaysOriginal]
              forState:UIControlStateDisabled];

        [view.layer setValue:[NSValue valueWithCGPoint:spoke] forKey:@"nuraSpoke"];

        view.accessibilityLabel = label;
        view.enabled = !disabled;

        [view addTarget:self action:@selector(menuPicked:) forControlEvents:UIControlEventTouchUpInside];

        [keys addObject:key];
        [layer addSubview:view];

        // Out from part-way toward the centre, one after another clockwise.
        view.alpha = 0;
        view.transform = NuraTucked(spoke);

        [UIView animateWithDuration:0.3
                              delay:index * 0.04
                            options:UIViewAnimationOptionCurveEaseOut | UIViewAnimationOptionAllowUserInteraction
                         animations:^{
                             view.alpha = 1;
                             view.transform = CGAffineTransformIdentity;
                         }
                         completion:nil];
    }

    self.menu = layer;
    self.menuKeys = keys;
}

/// Back the way the buttons came, the last one first; the layer lets every touch through as soon as
/// it starts.
- (void)closeMenu {
    UIView *layer = self.menu;

    if (layer == nil) {
        return;
    }

    self.menu = nil;
    self.menuKeys = nil;

    layer.userInteractionEnabled = NO;

    NSArray<UIView *> *views = layer.subviews;
    NSUInteger count = views.count;

    if (count == 0) {
        [layer removeFromSuperview];
        return;
    }

    for (NSUInteger index = 0; index < count; index++) {
        UIView *view = views[index];
        CGPoint spoke = [[view.layer valueForKey:@"nuraSpoke"] CGPointValue];

        [UIView animateWithDuration:0.2
            delay:(count - 1 - index) * 0.03
            options:UIViewAnimationOptionCurveEaseIn | UIViewAnimationOptionBeginFromCurrentState
            animations:^{
                view.alpha = 0;
                view.transform = NuraTucked(spoke);
            }
            completion:^(BOOL finished) {
                if (index == 0) {
                    [layer removeFromSuperview];
                }
            }];
    }
}

/// At once, with no collapse: for a hidden mouse or a new menu.
- (void)dropMenu {
    [self.menu removeFromSuperview];

    self.menu = nil;
    self.menuKeys = nil;
}

- (void)menuMissed:(UITapGestureRecognizer *)tap {
    [self closeMenu];
}

/// Told to the wallet alone, as a press is; it acts only on a button it offered.
- (void)menuPicked:(UIButton *)sender {
    NSArray<NSString *> *keys = self.menuKeys;

    if (keys == nil || sender.tag < 0 || (NSUInteger)sender.tag >= keys.count) {
        return;
    }

    NSString *key = keys[(NSUInteger)sender.tag];

    [self closeMenu];

    [self evalOnHost:[NSString stringWithFormat:@"window.__nuraMouse && window.__nuraMouse('pick', %@)", [self quote:key]]];
}

- (void)fadeMouse:(double)opacity {
    dispatch_async(dispatch_get_main_queue(), ^{
        self.mouse.alpha = MIN(MAX(opacity, 0.1), 1.0);
    });
}

- (void)dressMouse:(NSString *)icon {
    dispatch_async(dispatch_get_main_queue(), ^{
        self.mouseIcon = [icon isEqualToString:@"browser"] ? @"browser" : @"logo";

        self.mouse.image = [self mouseFace];
    });
}

#pragma mark - status bar

/// The status bar is drawn by the system over whatever the wallet paints beneath it, in dark ink or
/// in light. Over a colour a site chose, the system's own pick may be the one that cannot be read,
/// so the wallet says which: "dark", "light", or anything else to hand the choice back.
///
/// UIKit puts the question to the window's root view controller, and the one tao builds has no
/// answer of its own to give. It is given one, once: a `preferredStatusBarStyle` added to that
/// class by name and to no other, which a class that already had one would keep.
- (void)inkBars:(NSString *)ink {
    dispatch_async(dispatch_get_main_queue(), ^{
        UIViewController *root = self.host.window.rootViewController;

        if (root == nil || ![NSStringFromClass(root.class) isEqualToString:@"TaoUIViewController"]) {
            return;
        }

        static dispatch_once_t once;

        dispatch_once(&once, ^{
            IMP answer = imp_implementationWithBlock(^UIStatusBarStyle(id controller) {
                return NuraBarStyle;
            });

            class_addMethod(root.class, @selector(preferredStatusBarStyle), answer, "q@:");
        });

        if ([ink isEqualToString:@"dark"]) {
            NuraBarStyle = UIStatusBarStyleDarkContent;
        } else if ([ink isEqualToString:@"light"]) {
            NuraBarStyle = UIStatusBarStyleLightContent;
        } else {
            NuraBarStyle = UIStatusBarStyleDefault;
        }

        [root setNeedsStatusBarAppearanceUpdate];
    });
}

#pragma mark - messages

- (void)userContentController:(WKUserContentController *)controller
      didReceiveScriptMessage:(WKScriptMessage *)message {
    if ([message.name isEqualToString:kPageChannel]) {
        [self handleProvider:message];
        return;
    }

    if ([message.name isEqualToString:kHostChannel]) {
        [self handleHost:message];
    }
}

/// A visited page asking the wallet for something. The label and origin are decided here, from the
/// webview the message arrived on; only the payload comes from the page.
- (void)handleProvider:(WKScriptMessage *)message {
    WKWebView *view = message.webView;
    if (view == nil) {
        return;
    }

    NSString *origin = [self originOf:view.URL];
    if (origin.length == 0) {
        return;
    }

    NSString *payload = [message.body isKindOfClass:NSString.class] ? (NSString *)message.body
                                                                   : [self encode:message.body];

    NSDictionary *envelope = @{
        @"label": [self identifierOf:view],
        @"origin": origin,
        @"payload": payload ?: @""
    };

    NSString *script = [NSString stringWithFormat:
        @"window.__nuraDappRequest && window.__nuraDappRequest(%@)",
        [self quote:[self encode:envelope]]];

    [self evalOnHost:script];
}

/// The wallet calling the bridge. Only the wallet's own document is on this channel.
- (void)handleHost:(WKScriptMessage *)message {
    if (![message.body isKindOfClass:NSDictionary.class]) {
        return;
    }

    NSDictionary *body = (NSDictionary *)message.body;
    NSString *method = body[@"method"];
    NSArray *args = body[@"args"] ?: @[];

    id (^arg)(NSUInteger) = ^id(NSUInteger index) {
        return index < args.count ? args[index] : nil;
    };
    NSString *(^str)(NSUInteger) = ^NSString *(NSUInteger index) {
        id value = arg(index);
        return [value isKindOfClass:NSString.class] ? value : @"";
    };
    double (^num)(NSUInteger) = ^double(NSUInteger index) {
        id value = arg(index);
        return [value isKindOfClass:NSNumber.class] ? [value doubleValue] : 0;
    };
    BOOL (^flag)(NSUInteger) = ^BOOL(NSUInteger index) {
        id value = arg(index);
        return [value isKindOfClass:NSNumber.class] ? [value boolValue] : NO;
    };

    if ([method isEqualToString:@"open"]) {
        [self openTab:kSole url:str(0) visible:YES x:num(1) y:num(2) width:num(3) height:num(4)];
    } else if ([method isEqualToString:@"setBounds"]) {
        [self boundsTab:kSole x:num(0) y:num(1) width:num(2) height:num(3)];
    } else if ([method isEqualToString:@"close"]) {
        [self closeTab:kSole];
    } else if ([method isEqualToString:@"closeAll"]) {
        [self closeAll];
    } else if ([method isEqualToString:@"reload"]) {
        [self reloadTab:kSole];
    } else if ([method isEqualToString:@"back"]) {
        [self backTab:kSole];
    } else if ([method isEqualToString:@"forward"]) {
        [self forwardTab:kSole];
    } else if ([method isEqualToString:@"setVisible"]) {
        [self visibleTab:kSole visible:flag(0)];
    } else if ([method isEqualToString:@"setDesktop"]) {
        [self setDesktopMode:flag(0)];
    } else if ([method isEqualToString:@"openTab"]) {
        [self openTab:str(0) url:str(1) visible:flag(2) x:num(3) y:num(4) width:num(5) height:num(6)];
    } else if ([method isEqualToString:@"boundsTab"]) {
        [self boundsTab:str(0) x:num(1) y:num(2) width:num(3) height:num(4)];
    } else if ([method isEqualToString:@"closeTab"]) {
        [self closeTab:str(0)];
    } else if ([method isEqualToString:@"visibleTab"]) {
        [self visibleTab:str(0) visible:flag(1)];
    } else if ([method isEqualToString:@"reloadTab"]) {
        [self reloadTab:str(0)];
    } else if ([method isEqualToString:@"backTab"]) {
        [self backTab:str(0)];
    } else if ([method isEqualToString:@"forwardTab"]) {
        [self forwardTab:str(0)];
    } else if ([method isEqualToString:@"setDappScript"]) {
        [self setDappScript:str(0)];
    } else if ([method isEqualToString:@"dappReply"]) {
        [self dappReply:str(0) payload:str(1)];
    } else if ([method isEqualToString:@"dappEmit"]) {
        [self dappEmit:str(0) payload:str(1)];
    } else if ([method isEqualToString:@"showMouse"]) {
        [self showMouse:num(0)];
    } else if ([method isEqualToString:@"hideMouse"]) {
        [self hideMouse];
    } else if ([method isEqualToString:@"setMouseOpacity"]) {
        [self fadeMouse:num(0)];
    } else if ([method isEqualToString:@"setMouseIcon"]) {
        [self dressMouse:str(0)];
    } else if ([method isEqualToString:@"showMouseMenu"]) {
        NSData *data = [str(0) dataUsingEncoding:NSUTF8StringEncoding];
        id spec = data == nil ? nil : [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];

        if ([spec isKindOfClass:NSDictionary.class]) {
            dispatch_async(dispatch_get_main_queue(), ^{
                [self openMenu:(NSDictionary *)spec];
            });
        }
    } else if ([method isEqualToString:@"hideMouseMenu"]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [self dropMenu];
        });
    } else if ([method isEqualToString:@"setBarInk"]) {
        [self inkBars:str(0)];
    }
}

#pragma mark - navigation

- (void)webView:(WKWebView *)view didStartProvisionalNavigation:(WKNavigation *)navigation {
    [self publish:[self identifierOf:view] view:view loading:YES progress:view.estimatedProgress];
}

- (void)webView:(WKWebView *)view didFinishNavigation:(WKNavigation *)navigation {
    [self publish:[self identifierOf:view] view:view loading:NO progress:1.0];
}

- (void)webView:(WKWebView *)view didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    [self publish:[self identifierOf:view] view:view loading:NO progress:1.0];
}

- (void)webView:(WKWebView *)view didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    [self publish:[self identifierOf:view] view:view loading:NO progress:1.0];
}

/// Nothing in a visited page may leave the web behind. A foreign scheme is handed to the wallet,
/// which decides for itself whether it has any use for it, exactly as the desktop side does.
- (void)webView:(WKWebView *)view
    decidePolicyForNavigationAction:(WKNavigationAction *)action
                    decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSString *scheme = action.request.URL.scheme.lowercaseString;

    if ([scheme isEqualToString:@"http"] || [scheme isEqualToString:@"https"] || scheme == nil) {
        decisionHandler(WKNavigationActionPolicyAllow);
        return;
    }

    NSString *script = [NSString stringWithFormat:
        @"window.__nuraDappLink && window.__nuraDappLink(%@, %@)",
        [self quote:[self identifierOf:view]],
        [self quote:action.request.URL.absoluteString]];

    [self evalOnHost:script];

    decisionHandler(WKNavigationActionPolicyCancel);
}

/// A page asking for a new window gets the same tab instead, rather than a window the wallet does
/// not draw chrome for.
- (WKWebView *)webView:(WKWebView *)view
    createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration
               forNavigationAction:(WKNavigationAction *)action
                    windowFeatures:(WKWindowFeatures *)features {
    if (!action.targetFrame.isMainFrame) {
        [view loadRequest:action.request];
    }
    return nil;
}

/// A page asking for the camera or the microphone is refused, here and without a question. The
/// bundle names a use for the camera because the wallet's own scanner needs one, and with that in
/// place WebKit would put a question of its own to the user for any site that asked. Android lets a
/// site through only where a favourite was switched on for it; there is no such switch here yet.
- (void)webView:(WKWebView *)view
    requestMediaCapturePermissionForOrigin:(WKSecurityOrigin *)origin
                          initiatedByFrame:(WKFrameInfo *)frame
                                      type:(WKMediaCaptureType)type
                           decisionHandler:(void (^)(WKPermissionDecision))decisionHandler {
    decisionHandler(WKPermissionDecisionDeny);
}

- (void)observeValueForKeyPath:(NSString *)path
                      ofObject:(id)object
                        change:(NSDictionary *)change
                       context:(void *)context {
    if (![object isKindOfClass:WKWebView.class]) {
        return;
    }

    WKWebView *view = (WKWebView *)object;
    BOOL loading = view.estimatedProgress < 1.0;

    [self publish:[self identifierOf:view] view:view loading:loading progress:view.estimatedProgress];
}

#pragma mark - installation

/// The shim the wallet actually calls. Every method posts its name and arguments to the host
/// channel; nothing here decides anything, so a page that somehow reached this object still could
/// not name an origin for itself.
- (NSString *)shim {
    return
    @"(function(){"
    @"  if (window.__nuraBrowser) { return; }"
    @"  var post = function(method){ return function(){"
    @"    window.webkit.messageHandlers.nuraBrowser.postMessage({"
    @"      method: method, args: Array.prototype.slice.call(arguments)"
    @"    });"
    @"  };};"
    @"  var names = ['open','setBounds','close','closeAll','reload','back','forward',"
    @"               'setVisible','setDesktop','openTab','boundsTab','closeTab','visibleTab',"
    @"               'reloadTab','backTab','forwardTab','setDappScript','dappReply','dappEmit',"
    @"               'showMouse','hideMouse','setMouseOpacity','setMouseIcon','setBarInk',"
    @"               'showMouseMenu','hideMouseMenu'];"
    @"  var bridge = {};"
    @"  names.forEach(function(name){ bridge[name] = post(name); });"
    @"  window.__nuraBrowser = bridge;"
    @"})();";
}

- (WKWebView *)findHostIn:(UIView *)view {
    if ([view isKindOfClass:WKWebView.class]) {
        return (WKWebView *)view;
    }
    for (UIView *child in view.subviews) {
        WKWebView *found = [self findHostIn:child];
        if (found != nil) {
            return found;
        }
    }
    return nil;
}

/// The Rust side builds the window and the wallet's own webview, so there is nothing to hook until
/// it exists. This looks for it after launch and keeps looking until it does, then installs the
/// bridge on it once.
- (void)install {
    if (self.host != nil) {
        return;
    }

    UIView *container = [self container];
    WKWebView *host = container == nil ? nil : [self findHostIn:container];

    if (host == nil) {
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.2 * NSEC_PER_SEC)),
                       dispatch_get_main_queue(), ^{ [self install]; });
        return;
    }

    self.host = host;

    [host.configuration.userContentController addScriptMessageHandler:self name:kHostChannel];

    WKUserScript *script = [[WKUserScript alloc] initWithSource:[self shim]
                                                  injectionTime:WKUserScriptInjectionTimeAtDocumentStart
                                               forMainFrameOnly:YES];
    [host.configuration.userContentController addUserScript:script];

    // The wallet's document is already loaded by now, so the shim is evaluated once directly as
    // well as registered for any reload after this.
    [host evaluateJavaScript:[self shim] completionHandler:nil];
}

@end

@interface NuraBrowserLauncher : NSObject
@end

@implementation NuraBrowserLauncher

+ (void)load {
    [NSNotificationCenter.defaultCenter addObserverForName:UIApplicationDidBecomeActiveNotification
                                                    object:nil
                                                     queue:NSOperationQueue.mainQueue
                                                usingBlock:^(NSNotification *note) {
        [[NuraBrowserBridge shared] install];
    }];
}

@end

#pragma mark - art

/// The wallet's logo, as the mouse wears it: the bytes of src/assets/image/logo.png, in base64. The
/// project Xcode builds from is generated, and this file is the one part of it the tree keeps, so
/// the image travels inside it rather than beside it. A change to that file belongs here too, as it
/// does in Android's res/drawable/nura_logo.png, which is the same copy.
static NSString *NuraLogo(void) {
    return
        @"iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAA7FklEQVR42t29ebRkV3Xm+fvOvRHxRmWmUkpJIAbNaAAEYjBgkwaM"
        @"GKtc2C2X3V3Yq22vrmq7qGXK7S4XXeVVnstDddnYC1wFZVcDtnExycYYJAwYaE8ggQSWhFIDFpJAU6Yy840Rce/Z/cc5N+4Q90bE"
        @"yxRld+VSrPf0XryIG/fss8/e3/72t8Xf7T8BDg4LDhm8L+9+6rNWWRmd0SM712OHHO4cg0MmdxCz/UIHwA4arIMtg1YQA3nrIwag"
        @"PrIehkCavLcA8ICBGYaBxsAIGJoYYQxB22A7gg2wo4YeR3Zc5o56/CPCPezIHxmTPsR2/yR8aav7s1yXwCOCT1v53n93C/Df+5+D"
        @"ww4+7eOHr/9bueLc1OcXesdlEpfKuMjgPPDny7QPsY5c2v4RLN5KCz+2yq+r3xfPE8jA1FwCxf+EmUV7qb6fTb9vsKMMY8PgBOgB"
        @"wTfM/D0md8R57sxcci/btz+053vyP4ABFB8wq/1039P2p8PBlSQ8H+OFhq4QdiFya+DKBcLKm2wGmvzAMGv/PJIm66LG7+KaWm39"
        @"GptQqv/AsHgx4XfVP1bVq6h4TnzT+CMzsHzT0L3A7ZL9NTmfzwbD2zhx3/H6mx9O/3sZg7757h2rfpDe6uVXmvevwPFKsOeBOzc8"
        @"zddXw8yHhZ5sP02u11Cn1yyePrVzGxtW5V5uGFF8l8rfVn+vlttWOgSTATKz0kQsWoEr37V4eMAeAm4CPi7cJ8Zbd9xW3zjlE///"
        @"YgCC61z1PO+vX3aZz/luyd5g6LngXLGBw9YgL++KFG5Yyw1u36mNBdT8T2Ytvy9eo+bh1W0cVrGiRf6Fp5eeK1hoEj5v/OiWe8O+"
        @"INOHXMIHRht33lmPG973hBvCE20ASVxMgDRZvvT1cvphzF6Jkn7ls2fx7jkwTRax9rVx5GLdV157rkofP2vBWxfJFvACqp8j7OF1"
        @"q96pNJ7oIc1Aadj0gPkR4uPm7Z35zpE/BrKWe/z3xgBcEQXBNb3eyuYbzXiTnK4On90TP4Cb7PLagVzsqur/N3d+4/uuj6MFFrzl"
        @"96KINVred9Z7zzKCZuCJpr1N3ZJjFoJHSpFDBh5/ixm/4bfX3g03j+v3++/eACYWmSw/4w1y9lPgrg473ReWHRa+uSvDYV5uWhQ/"
        @"/yT6m78Ak0Wo3uA2F9/9aWsvbTZ/8RfY+fXXbLipxbyRIXx4M7mw5vkt5vUz+c5XPvREeQPxRJz1g0suTBP3K0jfFT6nzytBYIe7"
        @"1hyXOWPFuxak6lpnnNEzHUkI4uIT1B5z7OVYaRrAIkFq7T4ZIB8OR5fE4+GDSe5/Yji8695oBKccG+g0DMcAeiuXfL/h/iNyZ2J5"
        @"+8KXW7wMoNSSoBc3n5YdWF0Mm2MVez3/zSZZoyji0sb7VgLDmnPSHgxAk8Sw8jGsTBubwaysllICHjPDJQneHxP+zePtu9616AHZ"
        @"5b5P5bw3IE1WLvsNKfmFgLz5HEgoYvja+gpNIt3GLq0ulvZgk7OeVg0mNcPLFO+tRtpR+7vqh2kEgPPijSlwSS07Xy2eQJONoMrv"
        @"AjYlF+61VlHyBvUOHrLxVTfCfb6yNt80DxAS9n1P259mg/dC+iosyyYLbx1gmc1xwM3UqzUi59RjguqCW0uUp5ZsgjnXNDfgtHoa"
        @"qRlWMnVpmnNETNCxHKWpyG4Yp8PvjYCS20twqD0v/uqFhxLSj4jkeVg2BvUWPzEaN73D43Ve5SLZgGbkibaAp6y9V7kTJ780m58F"
        @"WBVutIZnmmMw8zKIKUO0MUp7ht2UM3odW/c+shcj0J7c/pkXryfD9JNC12B5hkgXcjiqWnYDqz/dENboRvHMujGDrlvRZoXV668F"
        @"dZqBB1jdaKSFs5LWa1UjIy6cQPB2mZSk3uzmfJC9nGN3b1QQxIXy93m3WXA4SYfufULXQD4G0j3bktmcQK7DPOeesQ30z6xM56hg"
        @"DDYPHKhG/y3v0zwiqvUJGu9t1KtMtsDWK/6WqRyyvLRqXF3+S83ysaRr0qF7HxxOGsHL6RjA4QTIeytffysk12L5GKO3h63VcuP2"
        @"GOzZPCOx2hp2LtzCLsdmntftrr961ncEjhPDsI63bASEqnyAIijsjHXUw/KxSK/trTz01oAPHE5O9whIgNytXvpPHMm7sXwM9Pa+"
        @"Ss3ofB7Q8s0ofej0jp5WeLphLNUFmQoo68875Y84KzaIMYFIejn5G/3WkffMA4s099xfuuj81KVfRqzHD+H2svnr93+PH7vj6Va9"
        @"11PBmNX9ozp23KJvuie8Xy2BpDXAo6ncfg+LTRfBofK/5mPcsZH53jPZve2BWfHAjCPgOgGWJslvSm4fZr62+NbicmtRg1qIFMzO"
        @"zdvQtjlevz1yn5URzLD/plVpwRPCrOvMqZztjSOkcf/UaYszMhizOnwd/siBeVyyL3Xj3wx/cJ326gESIE+WL/sHzumPrAB5Fvag"
        @"HdGxzQh+ukq8tULRjCh9KjKy2ZjD1HW2va6610Rt2UAzW2hJBafKys0XbfEgzetkETjZckgS8/4f5jt3frjrKFB31H9Fmq5kXwRd"
        @"DuZRMIA9pXuiJRqvYvS24PGh+eXbJ6Qm1pJ31Vy3po2oapBq1DpshnG1QdZNY6zczwlErUWrXJaDc5i/I9tOnwO3Z20+23VE/d6t"
        @"jL8PuSvA+2L3LxQ6qCXPt8a1diE+bYlLYUy2QKCuyvEzWcAWqFXN97P6+6oStU9xDa18/hRnoA2DstmVp0nqZ9PPtzojrW4wNp2G"
        @"Wu09E/AeJVe4Ff99IQaYzgo6PMA1abJy8hbJXR5Kukr2FPVrTnDYPLOZ4SLpCqhsca9hC/ydugGYmZBzE7JuI6JaC7JsjcxkkWB6"
        @"qpJo0561fo9yVHiB9avh5myOB7guASxZ3nyNlFyBeZtafFXyU83GVBa7yTY70GqLBSo33brexKwDZOlAl7quuZlpJAmkCaRpGdCq"
        @"xZ23gEcTiKB6fKgleKYaRGv69SfFK1WOJdXrD+HzJ5g3lFyRLG++JgaEySwP4ACfrl7yUZG8yiyv7/55mPwiBRpjmgHUdn52Ve/M"
        @"5sDAXVyBvYJBlb93cZ+MxjDcAbJY++qhtdXojf3i6eXUZ23Ulzvy/IIuU/cyTXyj7gXMLJcSB/6GbOvO1zTrBGou/mBwxcV5kt2G"
        @"1MMagGMnD6/bGEL6r2mSR+sCapoQooahsAglzErcQd11+cKYrI3t71x47yyHne1Q6jznXOyaK9FVl2O7O9hNX4bPfSnwnfq9GC7N"
        @"qYV1PcEiO6q7WSFyFpo1ho4NWd9khhgnWXrlcHj73VUjqOD5oTEhT8bfg9J+KPMq7WbntrtKK2rYlZvbDn12oTxtuXS3m6ndV1Wj"
        @"Z1Xo+81CT/3snhwKTpgcynPY2g6FtvUD2LUvx77rddi3fxtcdB5W3JWhoT/5U/jRt8DRY9Dvl57A2uv7U4tXMf5WClk1hqgtuM2+"
        @"TfXYJ4ekn/fy72HIL1SaUKZj32T10puEey4Wc/95/n0q158TcKlR857cnBayyJRX2AOvoJo+YS07w+ou3hvs7IAfosEqXP1M7B+8"
        @"CnvFy+GqS7E+2DZomIfgGiBxcCjBbvxr9IY3lv0hZrMxkWZq3JL2Te+qeXGVptnL5Vvmkku85V/It448rxmCT9x/f+3iK8ySL5mZ"
        @"a+EudVyE6nh388wV3a5qajE6QBqz+RSwqjufhwdVznXbHaLxDiQpPONSePWrsO94Bbr6OdiaYAdsO4fcB5CtimQ6sDyD8/okb/45"
        @"ePvbYH0/5PliPQpd/Q5qO28b1t1qMC1usdK0Anin5Fmjzdtvn8R7Vffvc3etnEsgz6Ba629QuJquyCoRbNW61YRmNZ3nNmH7yWLO"
        @"491bKyAkZmAG8Vy30RiGmziM5IKnweGXkr3iVfDCb8H2LcMQ/AmPjkUmuwSW1NF0Fb9y8Lih174e++3fiWytBT+D6CadzqyLV7xm"
        @"gUs0b+SUV7RcpKm37Frg9mLNowF8uvhor7SZBfG2AM2mzy1THTyZFRhVU7qmIZmdUtm4HheE3W5Zjm1t4WxEetYhkmu/HV72GsYv"
        @"/nbys8+EDGwLdHxM0bNiPqlVZNsMgESQieysC3DnnIseegh6vfYjsY2a1uQWtkWkbceqtHhRqYguQ5PBK4FfK9Y8nVSKDly4jyHP"
        @"rx0NHQCFVPRk2hy6duOMqxqNzUrfrFFxmoPlN7h0qpzrtrsL+Q7p2hq9F70Qd/g7yF7yGoZPfmrgUm+C/jYrEy0Liy4D85VrbctY"
        @"nGGJQDns24cufRbcfx/0BwGJbQOxpOkNoAo0rpZjo4EBtN63hVoVDMTzOXDhPh6/9wQxyndAnu4kzyLR2ZET7aaPnzKv6wThjDrG"
        @"PwV9aZoX0Ma1swUAIpguwDiBORiNsNEOST/FXXYxvRe/DF76OkZPew7jFPwW6IFwrjvnMHNhd+f1nS6zsmnLml4qOooETB65BHfF"
        @"t5L/6fUgmy5Xz6161j3FrJjP9lDUL+EBOTNvSGenO8mzMvgs4NIgzvBpSPS8UEnM8ym6VxNs0GzSzBQqJdWj/rYrXxTi7QJqshy2"
        @"t0MzzZPPZfk5r4WXvYHdi17AeGWVfAd4yKM8oKN4gU9C1uZBPm5aKzO5yfFqil1bVe8bewlkKBHkkJ11ORoso9w3FsUWbEmzWod5"
        @"2821hXrfOjPDHFxKYs8DPguHlcKni/d+gTr/2qZTlkWZM7WmD1VqK0KLMrG6Fj032B1CtoMO7EfXvBh923eSPeNl7KyfSzYEHgPy"
        @"MU7BO5hPkI/CD55gCHk80vKKnU9OrcbiV6EEwk43J9j00L8AnfkUOPY1SAfV1o9WR1inNWqhQEct/JNZxUG1vIcZL4ixH2n82A7s"
        @"qvhUN82KmYGVt/olmw541IKLVI+MRZgGzoXLGw1htAODBC68CPuWV2NXvQ47dBXmwU4Aj2bxpruw0y3scvnYdlfsdB9XNH6V1Qkc"
        @"MpUor4puRk3ObXOCJAgDJPsOoPOuwh4+gnpLE2+m6gduTdm0MB3KrE6q0cQrtLOHGyoXTuF8u2py9AO2unrBoaHpwnjBamXFiOn8"
        @"s9VB2DTY0wYWTeWzMwQf5EIevr2FkhzOOoh/9rXo2d9FfvYLIV3HNoB780BdUIUF7P0k2DJf784HF8/3kOYVwLdVYjVf5WVW44E8"
        @"x3yGGEP8ascS6J2PXHMbWku/QEv52xbADNRI7k3tMH376ygG7xeyesHZbH314RRgmPcvImElBoDqpi0zm+JszSKPnTr7twg8RyPI"
        @"t9HaClx+Dfklr4KnvxpWn06+DXwtRzYk9E06sF49U1JLHcrCea+4qOQe87so24XxFow2YbiJhidhuAn5TvA4412UjYLryEJBKKTj"
        @"fVAfS/bBsI/6Z0AhgTCzhNzOU6jFBVMM4QY7qiW2MnWkn6Gx0cCtpLm7KINgAN5xWZDLspYAsJ3h3EppZg4o0XredXXb5AFqPfdC"
        @"uORa8qe8HlavwG8CX4+vmwBKMJLy6vMhyoeQb8FoA7INlG3A6AQabUB2Ao1OYMOTMAq/s/EQjUeQDUO84PNQCTePXA+pj6kHrg/J"
        @"Mrgl6K2E79MVLDHUS8DtYqtPhuVzYPRwSLImfQKeVrGIhUnp0yDbpBtPauHfdvIdc+HS3Oky4C/SYEj+0pARNsuP063tc2HhNmpM"
        @"a85v064/1tuV58B+8nNeCgevwY4/HR66B0afwTkLoHx2EsYnUbYJ2Uk03sDG25Btomwb8m3IR2BDYBxzO98Ip1y09z7GEsYgtjwM"
        @"gD64XthlzofUzlnI+TWGZBiBILDEsMSjnmB5Hdtexu08hrFc9NGi1RUscSVMPAvomeqGVp07IM0skdkcNxuKpMmlk2qgxIW1YGKq"
        @"RN0o3LT1zVlTz2k+8jeFZzsHJ0+g1X3womfiLjwT7/+G5NFb8Ue24NERWl6FlRxjiFZS6K9i6TrWE/QSlDp86gJC10sDNiAfvIkU"
        @"UrZ4Pc4FoUAnRw/HQAmJS+IvUkhSTA5LeijpYUlK7lIs7YXfJT3y+HPfGzBO+vjBfth6E7Z1V8hSHn0MbvsK9oUvwXAI62fEuMRm"
        @"dAc3q302N+G3PUjVxGPwwokBGO7JtXdoLStWvu6F0DmPm28lk5mNLXTdd8K/+hH0nMtJnJt85OQY6P+F0fsfhFt2YP8arK9A0g+1"
        @"+KUE+nHzLsWvcTOrD9aL/9+L8FcKvhe+KoVRCtvF/yflcy2N+iZJKAeQxt8l8ZGWPw+gEJBcMMFYHcCOwS1fwN76TuyDH0YrK/HJ"
        @"VperazsamsH3HpumbDr+iPmIf3J8zvnL6crybSi5IBx8XfHjFMje3i69CDQxVZrNIfPw6z+L+2f/c3irzCOzkgmbAE747Qy7/ij5"
        @"2+6DYwYH1uKZPIDBAPpLAYvvJ9B30BcaWFjMHigVpBYXWOHniaGeQp2/7REXW8XiV36nnuq/T4PHURI3SyLoOVh3wUDf+jvwlp8P"
        @"1LK2FHnBuLlz8efqIxVqGP6r2fbOlQnL5x1y8H/EfTO/XaxZhOjCqTs6V6Yqnc7Bzi72tl/E/dPvQ6NxcJ3ORQAxikvkwnYtiIQ+"
        @"dx338oNw7wZ227Gw2y0vEUvvo2hKgrwL8LC58L0XFD/z4XVlLnzNhbxwFr6q8rPi4bzAC1nl4eNrFKm+RUjagkuwHNjJ0I6ha6/B"
        @"1vbDH/8JGiwt0EPJE6P7UmdDCXA+7f920uufeRHSj050czXj7dVxkW2kyKnegGm9R9IENo6jf/K9pD/3L9FwHILApmJH9bo9aMfD"
        @"gT56zSHYybA/fzDsavPBk0yqdx68BYUd7wLkFZG/8vsIheXl9yp+lk1/VV6JJ3NQ8Xe+fD3F7y0PaGOI3xxmwm9kcPi5uLvvhy/e"
        @"CktLFSqZ9r74TXk9zcAPVOGyizTBfi9R79CzJH4AzXEeqiJgmr5YtfTjSa1NFsH+hLI8BEXv/jXcmfvKSl6Vll+EH75iCE4w9uHG"
        @"v/wsessO/4mvh2idZtoVH7kPHiCP3sQrLlTLo1jwqjF4i96DitFEo4i4Ahnla+Ytr1ugkXIkz3gG9v4PYKMxcloMDm7TVmoD26qp"
        @"Zltzk5khlxjuQ0naO/CtyP2jGgg0t4OlCm6rm/7UPBKqRSLnYGsTve5a3P/+v2BZZNxUtLuxxvdWFc4KLle7Hl5ykP56ir/xfiyJ"
        @"VR1vpaEWubi3gOb5gBDJLBjEBBJWfeHySqHIWgwmr3iCSkFJvm5Ak0dk4dnQk59zJvrc59GRI7C03FLnn0V8tel+yyaiOpOIIpOc"
        @"vOWfSA3Ori1tJ+mzq1bdJHhqugVaXY2YHnvJNTgL57YlScuit4ssyMpCjD+ak//ABaxnOSd/9kvY/rzCVrLA0sl7KM8x3w/eIE8C"
        @"Ep5aIIP0HMot/H/h1nstC54LMiuDwzTsfItiOUrD90VQaEnMKopHn+Cpzkiw578IffyGBTu9Oppdm0dyNa3ojClCdcvhzk5NOtNN"
        @"EKU9Ln6b7p9Nt8h3poXqYVdeWtmp4UZXMfuprKFZm49s3vyYZ/sHL2bf0HPy338Zfyb1+m6ShwZnn0PSw/JeiAXSNGQDPtQK1HT3"
        @"SYEwxuvKLUT7ecEGihmFV0iisjJzKBbfJiljjAtSwTbwtIviE/382r7m4Ct7UVYpRItlZ6bAgYV6JlpbnqyBAKveRDmFKFbewHtI"
        @"e7gz1su3LmryvrH7my1WRSxQkUeUg/xYzs4/vZTlrSHbv34ndlYhR2yQZIHq2OtDkk8CRLwFT9AL5WXrhag+7Pa4WNVzP3qFsLjR"
        @"E1gldkgs7nYLBhK/D0Yg6BmkHp30uHQNS5KiQjMdrdeaUe3URCpnSTV4zkxldkCy0tN2wr3WznK1liqf2pXSZnWDTqpsFZfbFNi0"
        @"JqDYiA2cxOiYx970TNZH4uRvHYGzwvGiNAsCJ3kGaT8eCz48khx8H3xS7vyJF4hHQloeAzW8wBReY+yhF7GHKgreVIvxoU6kMeCX"
        @"Y4m7BcitdiS36SnaqeeMlYrf/hTcwRo8bjOaNbs4/2orCbecFa0VPyt3v1W8gNW7Xiel2jbF0EqJNwHGJzz82FWsb43YfM/fwlkE"
        @"JnDSBz8GvxQMoBfPGxvESiIRI1CZhXhQao1KZ6VkajnWT6EHiQd/9FGU70SugA/ZTlIpXiUg52G9j//qV3FJEiqZReZivhHd2wKu"
        @"f2FSYENxyA6mhq3PbJicyu0bXPzmz9r4gXS0iRtl/cFXzn9fm+LT6PKyafXWhgq/MxhteNxPPpfBdsbu++5FZ62HiS4+D4vv83AS"
        @"WlkpDRfQwyZc2coObGkrN3Lop+jYw3Dz72O3/gl69GvI7wa6eEEMVb0LQ3Lhc/ud8IvhZvjaXw6IZlUtDHW04akBknQU8lqXM45H"
        @"EuspZst17nNHI0VVeq1NBMHaaOC2EFJVa72vRtzN6nKFaWnxJli1p76S+rscdjc86VuuobcxYnzDA+jgCoxzZGXwYNYgqk4IBEnF"
        @"qFTBUEp2nvVT3Bc+jD7y06SbX2Pwguey/MYfwp93HiiIp+bmGRkMfcR7YjBpmaEs8hJHOWzuwkf/AH3jrhCnmLUIZzfkb8w6q60L"
        @"dVKallOklfja6q4n1oM9tXLS1E7Vbu2AbeGtWWP356VRWOPlrdkL6KuGXb6XyyE3R/rTLyLd+iTZZ7+BDu6DsccmQYYiubMuraeo"
        @"lGOVY0oV+rYNEtznfg/98b9g8NQLWXvH+9n8lpdyNPaIWt4AlsbxsUuYRzYCDcF2gJ14/SvPIfmtf9wxHEPz9QkWxZKLHgHZSqqA"
        @"pC9IL60MQGoKHrVPYmoXNChGCFSt2Fei6crNqwXIaifF1JxXQeUuLmnXk6WO5GdfivvxT+G/8Bg6sAIjK4eWOFeO9KkWRAs6WtEG"
        @"lhG8x1qK/vYm3Md+EnfxZei//D6PPump2GMesjx6srg4eYCelSkagmEjYBipCkPBrgef4JYPhWNguB3BA1tAj3ivyn81QYpBakZf"
        @"miHoXPu2SlTS9MSPme6maPvqiGKri1/Nu63q/WK2ItV75ZuqWzX4WGjH4wcD3M8fxn7sY9iRk2j/OjYOC25VHMJ8abAjF+vIqpAw"
        @"hMaG+8u3Ig3x/+ZX2D7wVLh/iEtC/dhywxUj53Kh3AI4VMDFIwUDHAWvYGMhS7CdvEwJtUh7uaYJNnupxJr10zBU0brn81gLA0Vd"
        @"Gnh0dhBb60SPSg5XWXyrFm2s0XGmJhGl5VElcRYJzlaOX1nG/cIr8G++AXtwE61bcMsqvSL4kvk7uc5eDbvQ17+MvnoD9qrXYle/"
        @"GH09C5Sx3ZA+CpFvG4xjSinhelY5CuL7DsHiUQDxdzaj2aYLImyomk8HgC1NOeGJg1QBnCzhoYW1Xq09Qq0FLDZxyyZNvrYx3W0K"
        @"X7fy++rLJjalIKPq4vsKnbeKGiI4kWMHzkA/8wr48Y9gJzZh1aNxvI5J/qmK+4klUvUC0ufBvvF5zLbgBd+BbRi2E58XwSO/aZx9"
        @"EPY/HTIzTnwNjj0otByvKYsLPwZGwsZxEUcdWdMMbL+WuRfJnXXoF5W8wmgp6qcR+5qTZ2p60dVC72qqelidpWod1LE69BvXYVyp"
        @"oDWIjU05QPMVI8it1s0zuSGFHMKxHJ50Jvp3r8T+9UfRzhasKJzNRQ5uhJrApAcgXnviYAzafAjcMnbWhdhxwY4mGYw/AZdcZTzt"
        @"W8VOYnjgnOfBfTcaD/2FYH9sQhlH4vDIys863iOwM9lQbURcW4Qw0Es7K9DWQSawRgcwmg9Od5BKVUn/JhjIpDYfXaZVRu65CL06"
        @"1RTbrBIwTipyMTW0qWMiGsFF56J/9XLs5z4Bu1toYCgONas1vlbVv30PRn0YZ6HfJE9hO0wVxgy/AYfOFk/5Nngkh50seHsSsfpq"
        @"WPqKsfMg6EAjMxhb6f06p9NaR+TfQjDtrB5OxQmF4sGiHWYVPoC6FLNncAVbSEJWRdzy4B6VWfhakDG8sOUEW0vwzk1IH2VfnyZe"
        @"w8bRxcZHeZPjI4tG8FiOnv009KaXwmgXG+8GJnG2g/JtyHYhC70A4RFp46PYR2A5GhpsV1K5x+HA042TTmxmsAlsGJwcGo8D7grg"
        @"UQvPHQaXbyODkcrrsxY52Rmi01M4TVOqtytAD6+tdIoDZOyBlNCtibcwe7EZwFVjgXEkjmx5/GfvxPoZ6QufgT+7j52M86k8KLcJ"
        @"ccPySjxRdf2NGysc9mgOL7wY/dAQe8dnsNWSeSQlQSNAkURSEFf7RGp3jOJ3gd34wltimIR7tA3sZjDOmFQZsyRYhG0rZJc5aBwz"
        @"Al/EAOoWotb0EIyp1rCpHoK2dGLiCZQaONmCFERbYFBi85LadH+75khU3Xix87cz7Of/EP7qC0ib+PP3w5teB69/IdrwJXpYIWAU"
        @"IMyk/y8u/iQ1nAxzFu5ojh2+Eju+A//tJmzdRcBHE5AoUpjC34xHkVfpsJjTaxxbkDaME1829r3IsTuykN6PwcaGznBkX9yBnT4a"
        @"EY6zXJOjwHLQ2DpUS9vItFT6h5qd2zatoNPujZ3TIqRCNaRNp3Zw/cLVMt9GTSZxW7rjS86dMoO+4OaHsJvvww7sw9b24x94GHvz"
        @"W9GvXw+rLkxrtrLdyzIgC6odVrj8LMQVlpU3PKBx8WfHcvTq58GrnwUnNzA/wsY74QjIdrBsF8uGkI1CY6q5MFx8ZCGSH4PtGgzg"
        @"+I3G8VtzRvscmRy5HP5AwvjPtvDXb8Caw0YhC2geTZapvXJqbSQQtRQZGq3IrZQw1XCNosjpJq1Gbdq2swSJZkl9VKRQjIZ4Muo+"
        @"BrIKlHpsFy3tx9xmWLXVg7C8hP+130XHT+B+8gcgywPNa+IJKilklVfgi4bRSpGnYPEe9/CdL4atIXz2COxTyOMnCGEs7mQjpH4o"
        @"MY9HwaMUsUc/dDYdf/NDuH8M7pp9+K0Mbt7E3rcJK0+CgYv8RJWE08xKkEhzFFM76Ho1jcGGCtoMB+9Tq9WVbAaM16w02Iz4QJ0Q"
        @"cTsW0Mjrq5VBpViyEskUoCw2VBx8Evw/H8e0DD/+PbCbx/q9yhtapJFmwUCwsh28UkCyoot47NF3Hca2RtgX/xZFIyhusbke5EMs"
        @"WQ3taw/djZ3zUlRF/vYDWwfwb38M7+4L/IPxAD3pHOzM5UAHsxLrsDx4qwkBdZFRPy3HsDUrutVUvDvLt1TVv+3Ce6zlHOpM+SoB"
        @"i6b1dSa249R6BJSUMIXz3PWgvxravGIznskhP4CzV7B33YDSPvzIP8J280gBb9YTNM01rHiHST9Mblju4LqXoa2PYXc9gtYF41gP"
        @"SAYwehxWr4T0TPjih3BX/6/1eY09Q+cuYevnw8ZOMNblPtZPoG8R4rcajRxfeCdbUHJ3L/0B7RZQOOYJHbB1IsmsWkPX5I+q6tVM"
        @"6bKS912rfPpGNpAWBrAGvTWsvw/1D0LvALg1OHgu9q5PYu/4U9if1CuRBeM3N8gsxgdMdlzV/Ya008G2h3EfrnsletJ+bHsTs6BC"
        @"Qj6C0XGs9zTyg9+Cu/PPSW95L+5Ags8DJ1x9wYqHM3I4ZwCHlrD18DP1qIAeFfBjUj4sjpo5ZfTm9LV5GVZ3mchSjDFSrxOC7LTI"
        @"jgkbUzMBNM1htxZaeQEINZW2lUBvNZA3SSAZYPku5H2U9bBsCe1fxv7rx9HyKvbdL0KP5GWsUQBLEyUQlTuwiAN8ZABFHJ/tHOsv"
        @"w/90LfzeR9CJTVhOUTYM2cB4B3/uD+I2b8df/3+Rj4BnfV/AH4ZFf2Cd2EJVTzpPJrosVBXEj30d8o3QzEjH9HRZZ9v+FDGrkXW1"
        @"2Mk4cb2DPwFaKgpdneBeU3uEjuEO1cWuMYkbM4MUXd8PfA886Vxsw6OxAi5fcOYSwYNj+Mp2aAB1SejadWls3e4hha5M9QfY5+7F"
        @"nXUQu+Ic2MhDcJeXnUDyjW4gXzJ+Jz0AeTTiXQ8ry+jpT4IjX8V2R7GzOAkR3+Ap2MrT0bFP4W57P8n2UbS6D0uXo1hF4IrLdpFt"
        @"o6hToN3jaPcoGj6ONh6EE/fith8kOfZFdOcvo9HRUldgVgwgzW4DU7dmUOWnW2nos543FKml5avJDm6aY61VqQOoiL2KhWGr0tQz"
        @"+X+XwGAVellY9HwMfhAIldkSNh6gcQ/cLrgR9p8/iw2W0QsugIfDWOPJeesNy600BA/yViKRxecqvMPJHJ1xEHvdd8D1H4PhNjaI"
        @"Lnr4MLbyXPLLfoPkkd9Fn38PuumdJGvnwmBfIKD6HPkgIUMeAQqfx+aUMYZD/VXMcshHKOmDG8yWnl94ilkl42vVDhBgw9TESG0i"
        @"UF2zAKbkYtUyTWleE3uJJqrB56t97w2SHgxWIBkHhQ6fBSPII8lTPUwpZNuQjMIC/6c/w/U28Fc+Cx7KAqpnZS+f+WqXUJ1/WGYJ"
        @"MfI/kcPZ56BXvAy78VNotB2Yv3kKo2PY4CLyC38Jf95tuK0vwc7XkN9BgwGmFEv7QTGsNwhUr8EA6/XR6gpu5zH8596BXC8s/OTM"
        @"0HwJ2VkDo7SgdoA0SoFha7HG6FazssaZ1DrsQN3xghowVTMGrUbqSRJavtM07KJ8HCjc+RjGsSnfpcE4smEwlDyHX/xx9BP/Frv8"
        @"pdijWSBpFtL5TcqWb2QGTRj5ZA7nPxW95CXwmc8EwyN2HOs4ZmNs+dnk+14WgtYkKTuBCl2Cfik8Qi8UhNzX74C//E1wK5U31WyC"
        @"jdFRh9njeKxwBA9T0PZElcjQQhMP2po0pqLUFmNQy5xdTc9QqhqBJS70/adJEIP00RCyqOzg4leVRmB9waM7uF95E/ZT7yV/8uXw"
        @"WOkJJnX9IjgsXH5u9QykYth2MkcXXAw7Q/j8TQHQUQp5D9wYhsdDAam3Br2l4LmSXslLqGY5ucd2Umx4EueS9lL7EzHvvcVLWEVx"
        @"0rBtF+pYc2TNZdOtX1XyZJsgUZPxo46jpQoNm2JeTincmABL/eA++/3gDQZL4Wt/OaSI/VUYrEF/HQZnhB01WEYnj8Iv/iB6+B5s"
        @"f4pZXoqetvX7FQWoAjLOy7KtvGAzh0uuhKuejQ23A+6cj1A874k9jqVcvAseSoH7rzQJ7e9p7AWYEFEXkJafkdrplOMF7TgFhb3u"
        @"CYJtEyym0B1rr+5YZajRnAtU0fDpK4SOPLZXLSew1IOlqALS66N+v1QEGaxCfw0VxtBfDYa0tISOfp3kV/433MlvYGuxqc+pPO+r"
        @"0PFk0Sv/n1UNQrDlsWdcjS65IswPsqAXWPQakGdl21mc4ipXpnxSqUAf9GOsVlPRPGa9msRrLazU07KvNxxmR9WFBBvtxXs1SV2a"
        @"T1/qnASj0j2aKoGghXM6AVYMlgVLLqiDDvrYYBA8wmAQPMJgBRusBC/QXw93PRvDyhlw/13oV38YDR+HlWgEUisRtdr3Xy6+TRg8"
        @"loF2DC5/Lpx/ATbcjXqDlUU3Hwy52sOgCs4TBURI2ps2O9O5Vk1BmysK1YLoRojAjjqTjlvT/WjRFCPSpdSGTM14zcZA5LI1zCbn"
        @"70SYwQHLUcBmKSIWSy54hEE/6gGVRhAeyyXXJc9g7Qx09624t/0osI31knoXSaPXv4oLTLzDBC0MTR029PCM56InPRUbj+PusQYn"
        @"JswtqmW/qrDN3QJdvXP0Nm1RqRg1FUuFpMcdxrFWodm5RqDpufdN+dNZx0qbaVd5AcXZ7AxWohEsC1sGli08llyIDwaDaASDILky"
        @"WC159RA8wfp+9OU/Q+/8FzDIQ6DoKnVzX2UkU1cKyVoesYbP5Vejp14Qahc+ah5NHgo7vYL4FQtvrrVvf3p67bzakO1FLGiK+fO4"
        @"k+xYx6zSxWlii/YiWYPUoBah0eouHEcvsxTbVwZWSsANolGsVD1CNIClfqW9OL5GNoa1A7jPf4Tkvf8arTjMxW5StaR/vgUpzEsp"
        @"GKIWgI08nP90dOHFWCH/5nrhaxJnGBQaAa7ymBo9206ls7ZBlMb8wehzJvOGU9aOpYJHYzChucMa2hoSdAr96g1Od238kGfSTME4"
        @"fFItxbO32HlOsf/eAlPLKfbiJ+HM9qJVZcpnsH4m+sx7UG8F/uFPw2NZoKzLFblRXR5mYhhWVhWNUsuIOGLhjHW0ug47o0BEURL0"
        @"CftRPq7ABVz1/LeWPsuWdLBFl8HQwtNvp0KKePGCR1NP8g018zp7AmTJZo5gtclQRtvaDYpqUWNHRVReBGAClix00ziLO8hiJK2J"
        @"W7Vifk8uyF1wtW0d7D6H1QO4T7wDP9iHf9m/RKMstHKro0RtpdrXhDFcQUBVlJIBVvv1F3Dl7q91nyWg8VYwShrwbxfK16yyWjvA"
        @"v4DOR7Tr5BvOkT+CTaStbbGVtRrVS1X3bl3slcbPEgc2wr5yJKhtVGVZslJ3B7NJAMhAMBCK6p/h/0N7v5ZAy+FY0EqDb2AVnf+i"
        @"2LC6D330V0n+8r/A/jSUch2tugNVbQCZRR1AWnsa8Bb1iwybLLrK1y7SwD7Y0a8GRFMN0KyRHnf6cU3T9KyNZTV1EEvgM0f+iBub"
        @"ewS0VR+w3LJorerTjflPHQSEKdJp5Qbqczfj8jh+zVsZ/OWUDZzLQD8aQt/QRA42/EwVeVgtgy0RM5OOoUvRCLS8D/3hv0NffC86"
        @"s4e5vNB2DMCoKnXVSRqsBru45aiZTBSrSMm4qrxsXPAHbq2vZpO9uYgar9TB+py3h7U1NveIY2frceDY3BywWt2bhzBVmUDWqEsX"
        @"NyjPobeE++tb0aOb+FhlUyX1UsGRWKrg6EsKgh4DRYOoBIXV52mG5mX1+vsruD98C7rjI7Cvh1weJGCr7lpduntWGyIpFxe7UAJJ"
        @"Gos+qQs42DyJ+9oXApppflqEYq/HcduMohl8HMQxdrYed/DAjgUFfpD8/HdQB7hTYahadaw67RPBDLS8hN1zD/69H4ADsR/PVAdj"
        @"HKF1q9jxfQJbuFfR++1TPgbRIzQ3hbXIp1kxDTRBH/gx3H1/hu3rBctLo7SLs3CcuLYoXqX0S4xBLAl6QjbREq4IVafClKM1oa98"
        @"DB67J1QKzRag2+8l6FdrODMpdgei6NfhgR0XX/TBIGkSsUhpRmhpNTpXFy9JU+dDi269N+j3cW/9Ldz9x7DVFCtGvPhIliTm/fH8"
        @"p2/lTuoRWrr6MSboRePo23QbQlVvv6Zt4CHphXP7Az+Ce/iv4EAPS/KoBO7CsVDZ2bVHXOziocq1FWLU6sVew9TDSgI7G+hTb8OS"
        @"XkMJ5DRKuzNAwPpuDG5LxoNM0Ghx70I1/JlCgVV+qlXa/62dFla0Ww+W4f774S3/Fg3irosqXaE5BFTgABN3b+WOL2Tde6obhptx"
        @"B5sMJZ+Htu/RLnrfP8MduwX29bBeDjGNU6KWxbdgGFE1vEj76EeKeGGsk2v1aN3hbvxV9PBdqL/SiP471n2PlV+1HAlNYlix5o7g"
        @"5Y7YwgID1g5PlcbVouRlnUgXeQbrZ6CPXI9+6RdgPciyWBZTQV9CwKqCQH0FqfZip6UWdxpYapU+/xnK2dW4xHvoLaGdE7j/9sO4"
        @"jdthfw+SLEwO75VuvTZ7oK/wvn2rLHz8/0GIWeiDpTl2Zg/3F7+P/vx3YPmMYHgdhbFTLfDMwgAqbbY440jpATx3xqck3YUHTUeq"
        @"nUUfi/11mupEmWYlhNxc6/vQu96Gfu1n4rmewDgLyppFZD+wyeIXGcFkIXrlMAf1uiZvtHClJmPdoifoL8PGY+gPfhB38ivBCNJ8"
        @"Yng2SUHj4i6VdQoKmHqpOrTCY31DZ/VwN12Prv834T26pPg6JvCdhkNovlCC+bjm0QCyZHQP+O2CqiPN6vxt4Y5VPYJUZ/mopavI"
        @"NJX7mg/K4br+t3D/9w+hE/fDSi/U4ZO83FH9cuHLnWh11k2Sxaa8GePu1YA0Cg+Y59BfQccfQr/7/bhjN8GhHgw8GviASi6HR33h"
        @"KSHrSTaSwxkJOjPBfeoduPe+OQ6KcO0SOTPHy8+PAzS/AhDDc7+dJb17ih0vxse3Xe/g90ruUF1IstFjJk33nM1qW55Zl2g5DrzB"
        @"0gp64HZ0y0eRLcNlz4AX9oOYUpaX5c9m82vUjtWy0NEH0A3/uZ6yzoKsp+YdGKQDtHsC/c2H0foBuOTqwALCo9RQzypHTyX+SH0Q"
        @"oFxN4UCCTtyP+4O3oE/+p1CpLLqMm232rddne6J/LdbnL2F2p9++4z9Q0bvOXe/gS5G7KmzFqMVek3+fIROrRk96W9W3TdlSmgZp"
        @"isBwuIXu/Bg68tngkp56Pu7Qaij84CJzuCRdIMMGKVoV+r1fQnd9Ltxwb7NH32hGGJ0GFrJu+xh67Ctw3tPh0Lmw5oK2cF9xJI2D"
        @"gbBloX0OrSdo6xHcZ38X957/E91zE6zsm+JBtg+FpEPWRbMn8S02OiaXEof5T/rx0ffHkR2HHdznXf/gU6XkVSEPi5Vqac4FNxjC"
        @"NIYYqgvGbBk2UX0dbyhJwln56IPoYx/F3XAD7o47w4CFpWW0toatJLCWwIqDgUO7J9G7/wO68b/C0mr3JA51uVm1BLVJCA4f+Bt0"
        @"yx/iHrwV2RhWl4IxLidYz+PYhq2H0b1/hfvTd6AP/iL63IdDXDFYDV+7FlFz9rS094Jbu6xcAD5kv+3HR/8KDrsCxsjTtUu+DUs+"
        @"M2mUa0ymmGJ9m82w1hbLndZ8na2EVZ067hSGRI+2w+WedQid9xTs7POwfQegN0AnN+D2L8L9R2BlbbGBVlVBZjV+1hRaCJowQcMP"
        @"Q2sHsLWDsLQW/mh3E7Y2YPNowPcHq0GUuio793f/L1xInr80273rs7F8Vtj/NfvSlc27kM4OXkBusbSwPCZqsvBqGSXfMUhqIYn6"
        @"whAMGI9Dm3Ye5EAmsM9gEBi51fRqFuHS2pJvdaMqxWxDYvqaxz52I3YtJZCkFU9onR99nrtu1YI+PZn4sKbmH80G65fw+M0noBwX"
        @"6uDmE+jSz4N7beegulo9qSqmFHvr2oqJU9Zv0zRx0WEYVhepzmK9PEmgt1JW+KrhvOWnApXN9sXV1NcXPecuMJVpqKd7357yagEB"
        @"R83o47NTGxSgmlibQPp8XHwXtdEhxAGA5+NahBpULH4tiGubKqKG99X0WLJOUKlrGFV8r9xCyjZR/46kzKl6qbrrqnPoa+pIpVVd"
        @"9Emnr3XOV9K8Y1qaM+OnDLLnKcDNGBpmUbDz49U1jwbwaR/wAH+jWZ6jKiCkxUbISY3EvwwIba9jTmcBTW0Ty6xFir4tVZ2Jj0zL"
        @"r9k89lu1CNY2q2fO57VZNQBmSzZ3dQRY5/srMctzp/TG6pq7Sjuk2Lz7DjNujWyKvHUww4J8keaAhdnUsI5WNNuDgXQRKLVAPb05"
        @"7WwWCaOtoaXL3c9q3TM7reBQM2/Q1K9yJBl262jz9jvK4Qg1YvLhJKCA9oHJ4dzaNWoLuKpmAWoeRWwBNWxrpx3slZc6rbHK/F68"
        @"WbxI2WI0+g6n80Ti/W3eqqK+gEwfCN8fTtouwQF+cMYVF+dZdhvQC3oBYqaEzCIlDHXw8xYqMs7AFbD2tHLvw3PmnnDWRa7rksnS"
        @"bBx/L0Of1VYf0B5knUOuO06y5Mrh8Pa7i7VueICgFjY8efvdmH0ygoH5DP7T/KoFC5yJXWVLdbBcOlHuOccG8zuu5ynltmU4beLq"
        @"CxGr9zbjZ/GjV1MWk8dl/mRz8ZnuTbkuBpnu7WpGWxN3aXOjDu2VvVRBmayTi6j2BVYb52HvsxS0h3yqE1+oDbqyOb2d1ln/tz2S"
        @"P+Y8UWAyz9urazwHVr4mTVc2bpHc5RaQlqSzBnCq08ua4EbXMCo1kEHbAw1ds933E3lktHFDTZx2jb9bd6PBuWj3zrkkZ2Z3ZNtr"
        @"V8PNWfMy3PRbHk7g5rGwX7bijrdV8rRgNwJ7qGGq0m4+hc2r3iZjp+5hpdO41s4m18ae66IjzNTs2hOuv8DxZhiSR78MN4+rwd+8"
        @"wpLgijRdyb+IdDnmPVISMqUZOhKL3Dwt3m122s+bt/s6h3BYu/LZnOD0dJk8p/w52tPRXDhn5u/ItpPnwO1ZW5Tkum/L7SMzfrIJ"
        @"bVltqlaNCdadCmKtaiDtBSXrDuZsjkYhe8/kWn/UBBRaK4nqJEkvIvGqU7hom7cZ1BytisIa3j6KZ//US7iOt8/huiTfufPDWP5H"
        @"yCWhe6iCVZst3I7UMnRvRplZC+gVLiCSeLr5dZWIMQv0mXu0FbOIbDaxaoZ30wIxSR0itgwliVn+R/nOnR+G6xJ4X75XQwzddUsX"
        @"nZ+69MvAenwHN3tKmLrNVzMGIU5NGOu4IXYaTalz3ai1t8jP0N1bTKMnltQnBbPGaB3NO5ZU96Czq4M+Pn8j8+kz2b3tgSryt6gH"
        @"mOAC7N5zv7z9c8k5RD5TSayJ/Nsc2fOOvMfm1h1OJfPQAu30HaJ6mlNt6YBJmuNdrMZNmEGamQtgzHS9OXLOy/45u7fd38z792IA"
        @"8Sg4nI53j7zHm3+7SHuYjeuDo9oQW3XfOHUojxqzz9zTjrBsHmd6ekSLFqi8qWXwhU2l4d2fa169Y57WQ917jFHak+Vv91tH3gOH"
        @"08okolNu7I6tjoeVLn/jI3LJtRZaWnuLTpZ7oqL504qabUatdC/ufpEjaNZ7ncrRtBA+YWOR9oz8xmzr3NfBp60pdnc6qnOx2/7i"
        @"9WQ1/aTQNViegdJaet51d9RGaphDg9E3NWnamyF2LXrL9524/RyjUGMu694+kWVSmnrzN+eD7OUcu3tj1rm/lyOAWrmYu0/mjF5r"
        @"2E1yaRqm4TQXdtbiz7C9WQJJM3UHupC4BSzJ9hDUaY7BzGvqmDvP2RZ+28a/MUpTzN+UM3otx+4+ueji78UAyqBw695H8nTnlZZn"
        @"N8ilvZAextKx6uph7duhA1FsW5AmlkAH22ZmzmyzawPao8pJFyl2xutryqCtO6BckEwSBAwsE0kP8zeM051XsnXvI/OCvtMxgNII"
        @"Ttx3PNs57/X4/G1SkoYesCoZr5rqdEwM07TYAl3jy6zbYxgtN1kLlNa6SCiLFB/VHEVn88vKduoob8sTciQFL5y/Lds65/WcuO/4"
        @"Xhf/dE7ayefqrVzy/Yb7j8idGdSSKBSX6uPMWHTYlGZMLNNMVzxNXT/Fc32W723qIXMaHmQe6DVVFArtMJJLzPwx4d883r7rXacT"
        @"RzpOi0pxXTLevutdSe6fj/kPIpcg5ybjG9VMgawFKlZLw4hNj64xdTOJrCk3Z/PjBTVZyS2qH3MJMKcAR1rbMD9r/9zlr4N4jhIn"
        @"ucTwH0xy//y4+MnpJBFPRAKWFLlmsnbJG2Tup8BdHTXffGR5uAqVeIFc2GanBJqz262qhbVo4cqm+wMb11p3593l6ZkR/RQSai3n"
        @"2ETP2090RSUwf4tJP5NvfuVDzXt/OrnSE/GvQi69ptdb2XyjF28S7upw3Z440tFNcbXVGE49re3SDc/Oo5JJs23J2iJKTaerXRVB"
        @"LVDDnznYeQo5rIzDVlreVrtFZr8x3l57dyjr1si8/H0wAFosMk2WL329nH4Y7JUo6ZfdMlGWTlGKyfZaBWnDHZhZX1ispNbG8plB"
        @"RNkL4GMdTTGFGqGw+qLnI9DHzds7850jf0yQy3hCdv030wDia17nqtWn/vpll/mc75b0BsOeW/ZXTUZ15WWbj1SVypQ6GDHW1mLe"
        @"ZBHNQCatS1VLp4xW1hxNy9C0cC4UIoJmQBIyqOJ2eC/ZF8z0IZfwgdHGnXeWr35dAu/zT3T985vZsajKRMWJq+qtXn6lef8KHK/E"
        @"8zykc8u+wqpaA34yyazZCWFT+vRTE0qZR8eyjnkIqLXqJnVAGmposNQ/SKHCqzAhioZ8mgf8Q3jdBHxczn1ivHXHbY2jVYtAun8f"
        @"DaARIxx28Oms9tN9T9ufDgdXkvB8jBeCrgC7UHJrhmuUl6Lw1KSmajZLRb9lBJ46sX5rNaZJHKeAWZhN7++qIGEJ+1h1pq8ql+s3"
        @"QfcadrvEX5Pz+WwwvC3m8JV/h9PYueO/2Qvzd9GzXBhD6wdcWbni3JHPL/SOy2T+UsldZHCesPMx9iFbB5dWb3AXlCqYZhl39B1M"
        @"Nm4Xv6sy5cwq9lXvUfAZaMOwE6AHBN8wcY8ZR5zP7szc4F62b39or/fkfzQDaK00wiHrYq2Ef89aZWV0Ro/sXE9yyHl/jjl3yMwf"
        @"dNJ+ww6ADhpaJ8hKrQTFnkLSyQpRuVK9yiiUUHxd/FBhwHyYqTgyGIK2wXZkbCA7KvS4l47LOCr8Ix73sCN/ZEz6ENv9k/Clre7P"
        @"cl0Cj2jRit0389//B4mz6D3PU+fQAAAAAElFTkSuQmCC";
}
