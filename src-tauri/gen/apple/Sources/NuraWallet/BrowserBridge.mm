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
            // mouse would cover it and take its presses too. The mouse goes back on top.
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
- (void)mousePressed:(UITapGestureRecognizer *)tap {
    [self evalOnHost:@"window.__nuraMouse && window.__nuraMouse('click')"];
}

- (void)mousePressedTwice:(UITapGestureRecognizer *)tap {
    [self evalOnHost:@"window.__nuraMouse && window.__nuraMouse('double')"];
}

- (void)mouseDragged:(UIPanGestureRecognizer *)pan {
    UIView *view = pan.view;
    UIView *parent = view.superview;

    if (parent == nil) {
        return;
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

    // A press waits to see whether a second follows, so a double press is never also a press.
    UITapGestureRecognizer *twice = [[UITapGestureRecognizer alloc] initWithTarget:self
                                                                            action:@selector(mousePressedTwice:)];
    twice.numberOfTapsRequired = 2;

    UITapGestureRecognizer *once = [[UITapGestureRecognizer alloc] initWithTarget:self
                                                                           action:@selector(mousePressed:)];
    [once requireGestureRecognizerToFail:twice];

    UIPanGestureRecognizer *drag = [[UIPanGestureRecognizer alloc] initWithTarget:self
                                                                           action:@selector(mouseDragged:)];

    [view addGestureRecognizer:twice];
    [view addGestureRecognizer:once];
    [view addGestureRecognizer:drag];

    [container addSubview:view];

    // It starts out at the top of the screen, in the middle, under the status bar and whatever is
    // cut out of the screen there: the window runs behind both, and a mouse up there would be
    // hidden by one and out of reach behind the other.
    [self place:view at:CGPointMake((container.bounds.size.width - kMouseSize) / 2, container.safeAreaInsets.top)];

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
        self.mouse.hidden = YES;
    });
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
    @"               'showMouse','hideMouse','setMouseOpacity','setMouseIcon','setBarInk'];"
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
        @"iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAABmJLR0QA/wD/AP+gvaeTAAAfXklEQVR4nO2daXgUVdaA3+otvYXO"
        @"vicdAgQQMGIGdQYCsqigsrshiyOzKIvgoI64TRhFHVdQlHFQxwERZRdwQSOrfoACsrlA2CMEkhBISCfppJO+348mgUCSqk6q00Hz"
        @"Ps95CF2n7j1176lbdbdTEr5BB1wN/AHoALQH4oEgwAIYfZTv5Y4TcACFQBaQCewFNgHbgUr/mSaPEbgD+BjPBYgWUVUKgeXnyrhZ"
        @"3UDxwEzgDP4vpN+KnDlX5nEK6sdnRAFzgDL8XyC/VSkD3gIiZOpKVTTAGOCUShfRIo2XM8BkQFtPvalCBPClHy+0ReqX9UBMXZXX"
        @"WPoCOc3gIlukfjkJ9K6jDhvMUKC0GVxciyiTMuCuWmuyAdyPp//p74tqEe+kEvhrLfXpFXfRUvmXs1TiGTdoEH1p6eL9GsQJXE8d"
        @"SHX8HgnsxNPXb+HyJxe4Cjhx8QFNLcpaYCEtlf9rIgJ4n1rqu7aBg4nAOF9b1EKTk4Sni7jtwh8vfgRE4pl9Cmoio1poWs7gmZ3N"
        @"rfrh4hZgBtC9KS1qoUkxAVbg06ofLmwB4oCDgKGJjWqhaSkD2gDHoeZLwcO0VP5vgQDgoar/VLUARjxdhJZn/2+DM0A0UKY798Ng"
        @"fsWVrwuNQR/fDl2kHW1gCJLRgsZoQTIHAiBKinA7ixHOYiqLTlNx8gjlx/ZTmX9Jt/nXQjBwK7C0qgX4GI8TXPZobWEYU3phSulJ"
        @"QHIq+rh2SFodruMHcJ04jLvo9LnKLsFdXAiAxmJDMprRGC1oAkPQxyShj22LqHDh+iWTssztlO7aiHP3RioLT/n5ClVjKXCbhGcB"
        @"Zz7Qyr/2NBxD4hVY+96NuduN6GPbeips5wbKfv6W8mP7qcjJAuH2LlFJgy4yAUN8MgEdr8WU0ouA9qm4fsmk5LsvcKz9kPKjP/vm"
        @"gpqGAiBMAq4BvvWzMV6jDQrH2vtOrP3uRh9px7FhCcWbVuH8cTPCWeyTPCWjBVPnP2D+wyCsPYfjOnkYx1cLcKxbqGrLoNPpqKio"
        @"UC29evgdwIP4f8JCsegiEkTYhFdF4vIcETVtkbD0GCIkfUCT2yEZjMKSNkxETVssEpfniNBxLwtdRLwqad9zzz1NdR2TAP7j70pV"
        @"IvroJBE+5S2RuDxHhE9+Q+ijk/xuU7VtMW1E+INvemz722yhi0pscFrR0dHi66+/birbZ4NnHZnfC7EukQxGETzqCZG47KQIvf9F"
        @"oQuN8btNdYkuPE6EjntZJC47KYJHPiYkg9HrNEaOHCnKysqExWJpCpvXgGf0z++FV5uYruol4t/eIWJeWi0M9o5+t0ep6GPbiejn"
        @"Von49/YIc7cbvTp3zpw5QgghbrjhhqawdT9Anr8L7GKRDCYRPvkNYf/wkLD2vsPv9jRIJElY+9wl7B8eFmEPvFZva2A2m0W/fv3E"
        @"9OnTRV5enhBCiO+++05MnjxZpKSkCI1G4ys7c8CzYsT/BXZO9LHtRNzsLSL6X58JbXCk3+1prGhtYSJq+scibs52YUjoUOOY0WgU"
        @"DzzwgMjKyhJ14Xa7xYYNG0Tfvn19YV+JdO6PZoGl53DCJ82iYPGrFCx6Fa/77vVgs9lISkrCbrcTFhZGcHAwGo1nKsTtdlNQUEBu"
        @"bi5ZWVkcOnSIwsJC1fJG0hA84u/Yhj1A3ozxFP/fiktUOnbsSK9evXjiiSeIi4vjiy++4O2332bjxo3k5eWpZ0st+P0uAYRt8Hhh"
        @"X5QljF16qJJemzZtxJgxY8Tbb78tfvrpJ+F2u+u8y2rj4MGDYtGiRWLChAmiQ4cOqthkSukp7It+Ea0G3lenzqxZs4QQQvTs2bOp"
        @"yt7/lR90xxRhX3BQGFp3blQ6ycnJ4umnnxb79u3zqrKVsHfvXvHMM8+I5OTkRtlosHcUCfMzRcjYZwSSdMnx2267TZSWlgqj0fse"
        @"xOXnAJIkwibOFPFv72jUIMott9wiMjIyvL7LG4Lb7RYZGRnilltuEVItFahEdJF2Ef/uThE2ccYlx8LDw0VGRkZT1oP/HCDknnQR"
        @"//YOobWFNej8/v37i61bt/q80uuia9euDb52bVC4iH93pwge89Qlx4YOHfrrd4BWt/5VJHywX+giEhqcRkpKiigrK/ObA4SFeRzX"
        @"kjZM6GPaeG2/LixWJLy/T9iGTKjxe0NblsvGASw9hwv7oizvB3ckjbANHi+Cbnuw+rewsDBx7NgxvzhAVf88+rlVovWKPGEbOlEg"
        @"eddnNyR2EvZFvwhL98FNXg9+cQB9XDuRuCTb67d9basQEf3sCpG0ulgkrS4W4VPeEpLOIMDTn/7666+btPJ//vnnatvsHx2ptiv6"
        @"hc+FNjjCq2szpfQUiUuOC31s2yZ3gNo2hvgMyWAk8rF5FCx+FeeebxSfZ2jdmdg3NmFK7Vf9W+CNo4l6biXaViE4nU569erFW2+9"
        @"5Quza2XVqlUAaIMj0QaFV/9uSulJ7GsbMbTurDit0l0bKVz+BpFPLUAymFS3tT6a1AHCxr1MZdEZzyCPQkxdexPzylfoIuIvPXZl"
        @"GjEz1qGPbYfb7WbcuHFMnDhRTZPr5JtvPA5sSLq0onUR8cS88hWmq65XnN6ZBS9QeTqH0L8+p0hfp9PJKymgyRzA3O1GzNfdTO7z"
        @"Y1A6wmfudiNRTy9Fc27tXm3oY9sS+9p6TFf1AuDNN98kLS0Nt1u9UcTa+PHHHwEIaN2l1uMacyBR05djvnaAsgSFm9yX/oSlx1BM"
        @"qX1l1dPS0rDb7YrtrYsmcQBJH0Do/S+SP2eq4pUzpquuJ/KpD5H0AbK6GmsQUdNXENj/j4Dn7mzdujVnzpxpjNn1kp2dDYAhqXYH"
        @"AJB0BiKfmF/tnHJUnsnl9LtPEDZhBpKh/khwvXr1olcvZenWR5M4QNBdj1B5OgfH+sWK9A32jkQ+uUC2EC5E0ukJf/BNQu9/ESQN"
        @"WVlZJCQk8MMPPzTU7DpxOp2UlpZ6bK3HAeDce88/FsrqVVH01QIq8o4TNHzyJcf0ej09evTgySef5N577+Xvf/87Dz30EKmpqdXz"
        @"Gt7icwfQRydhGzqRvFmTQAhZfW2rEKKeWY7GamtQfrYhE4hK/wiNyYLD4aBr164sWbKkQWnVxeeffw547nB9XDtZfY05kKh/fITG"
        @"omDdrRDkz56C7fa/oYus2cS7XC5yc3PJycnB6XTicDjIzc0lNze3wY88LTCtQWcqJPSvz1O29zscaz6SV5YkIqb+D2OHbo3KUx+X"
        @"jPnaAZRs/YKKogKWLFmC2+2md291YifNmjWLbdu2YUi8AtvA+xSdo7EGoY9Jovjr5bK6lYWn0IXFYLqyJyXfflbjWH5+Pt9//z02"
        @"m43Vq1fzwQcfcPbs2QZdB/i4BdCFx2HtOYzCZbMU6dsGjcPy+1tVydvQujOxM9YRkHw1QgiefvppBg9WZ+vD999/X52HN1jShhHY"
        @"725FugWLXsXa+w50EQm1Hl+/fj0bNmzwKv/a8KkDBN35EEVrF1KR+4usrj46iZB7p6mavzY0mpiXvsDSYwgAK1eupHPnztXP74Zy"
        @"8OBBoO4eQH2ETpiBPrq1rF5F3jEcG5ZiG/5Arcc3b95c/SLaGHzmANqgcKx976Zw8QxF+qH3v4hktKhuhxRgJvKJ+QTd+TDg6b7F"
        @"x8eTlZXV4DSrehfetgAAGpOV0PteUKRbsOgVAm8cg9YWdskxtbq5PnMAa5+7cO7agOvEIVld09V9lPeXG4IkEXLvPwl/aA6SzkB+"
        @"fj7Jycls3LjR66T27dtHZaUnarvSN/uLMV93C6au8u8jruMHcO7+GmvvOxuUjxJ85wB9R1D01QJFusEjH/OVGTUIvGEk0f/6BG2r"
        @"UMrKyujduzfTp0/3Ko3zQ8ARaIMbHqM55J5/KNIrWvMh1j6qxXy8BJ84gMHeEX2knZJvP5fVDejQDWOnP/jCjFoxdu5OxKPvgaTB"
        @"7Xbz1FNP0alTJ/bv36/o/Ooh4AY0/xcS0OEaTFf3kdUr2fIp+pg2GBKvaFR+deETB7D2G4ljwxKEq0xWt7YBD1/hLneSM/1uTjw5"
        @"uMZw9E8//UT79u0ZPnw4Tqez3jSqh4CTrmy0Pa1u/pOsjih34ti4FGtv37QCPnEAc7cbKd60SlZPH90aS/dBvjDhEgoXz+Do8BiK"
        @"v1kBQtCuXTsWLVpERkYGnTp1QgjBsmXLsNls/POf/6wznePHjwMNf/5fiPm6m2t9wbuYks2rMHe7sdH51YbqDqANCkcf2xbnj5tl"
        @"da39RoLGtyHuS3euI2tUMvnvPolwlWGxWEhPT2fPnj3cfvvt9OvXjx07djBz5kxsNhvl5eVMmzaN0NDQ6ud9FTWGgBv5CADPSKKS"
        @"57vzh03oE9qjbRXa6DwvRnUHMF7Zk7J92xRt0bamDVM7+2oqT+eQPaUvJ6beSsWp40iSxOjRozl48CDTpk0jIOD8JJNer2fy5Mkc"
        @"PHiQSZMmodVqOX36NIMGDeKqq67il1884xirV68Gzg0BxyerYmfgjaNlddylDsoyv8d4ZZoqeV6I6g5gSulJ6S757pU+ti36hPZq"
        @"Zw9uN3mvPcDRUW1x/rQFgGuuuYZNmzYxb948IiMj6zw1NDSU1157ja1bt5KW5insXbt2YbfbGTZsWLUD6BPaI+nUiadlaN0ZXVSi"
        @"rJ5z10ZMKT1VyfNCVHeAgORUyn6WjzfhzWIJpRSt/h9HhkVR9Pl/we0mNjaWuXPnsmXLFq677jrF6XTt2pWNGzeycuVKEhMTEUKw"
        @"fPly5syZA4AhsZOqdisZE3D+tIWA9r9TNV9Q2wEkCX1sW8p/yZRVNXZWJx5lZf4JCpe+zi9/upK8mRNwO4sxm82kp6eTmZnJmDFj"
        @"kKRLY2IXVwhezHTxYqaL4oraZykHDhzIjz/+SHp6OmazGXFuNlPRrJ4XmBSUhevYfvSx8jOP3qLOuqKqxEKikXR6KvKOyeoGJHdt"
        @"cD7uUgfF36zAse4jSnduAPf57ykmJSWxbt06EhJqn0QRwMfZFbyQ6SKvzFOhi45XMDFJz+gEHdqLfMVsNjNt2jTGjh1L7969OXTo"
        @"EELl8C0ByamyOq6co0h6A9rgSCrP5KiWt6oOoI9vhyv7YI0KqQ3JaEEf09artEVlBaXbv8KxdiHFmz9BlJVUHzOZTISEhHD8+HFi"
        @"YmLqrPxdhW6e2VvOjoKa4+hnygXP7C1nWXYFT3Uw0C340oYxISGBmJgYDh2SH9r2Fn1cWySDEVFezxiEuxLXySPo45JVdQBVHwG6"
        @"qNYeB5BBH2WHWprl2ig/+jOn//sUWaPacfIfw3GsX4QoK0Gr1ZKSksIHH3xASUkJt9xyS51p5DgFD+8pZ/gW5yWVfyE/nnVz13dO"
        @"/vJ9GcdK5RevqIakQRclv77PdfwA+hj5mURvULUF0FhtuIsK5DOtY467CteJQzjWLsSxdiGu4+eHaCVJok2bNtx777088sgj6PV6"
        @"RXaN21nGrkLls2dr8yrJLy9j2XVN94VWfaQdV9a+enXcjkI0loatlKoLdR3AaMVdWiSrV+v0pqOA4i2f4VizgNKd62ssHwsJCeG2"
        @"227jmWeeISLC+wmYhtzLTXj/AyApeLEUpUVoTFZV81XXAcxWRKn8AJDG6olKK8qdlHz7GUVrPqJ0Wwaiorxax2q10r9/f6ZPn077"
        @"9j4YL2gGuMudFC56haIv51ORK78+wV3qQGOqe4l8Q1DVASSjVdGyb9eJQ+TNGEfxNx/jLj6/nk2v13Pttdcybdo0+vaVXxt/uVL0"
        @"xTwKV8ym/PCPivdIALhLitBF1v/49BZVHUApJVvOL3TUaDR06dKFSZMmMXbsWH+Y0yQ4f/g/ziz4F87d39Ro6Ww2G8OHDycnJ4dP"
        @"P/20nhR8g6oOIJwONEZlzyi73c4f//hHpk6ditHYdC9bTUnFicOc/uB5SjZ/Uh2YGsBgMNC/f39GjRrFwIEDMRqNTJo0STY9jTkQ"
        @"UeJQ1UZVHcBd4lC0nn/EiBEsWKBstdDlhrvkLIWLZ1KUMZ+KU8drHEtNTWX06NGMGDHikpdZJbuYNCZlj1hvUNcBnA504XGyeo1Z"
        @"x94QlI04NOIcdwWFq+ZQ9Ol/Kf9lb40eTHJyMiNHjmTkyJG0adOmziTy8/PlbTIF4j55xBvLZFHXARyFaALlvztx5MgRNbOV5d9X"
        @"BfDSfhcfZ1co6t71CdeS3lF+tq/4288oXPo6ZT9uRlSeHx6u6raOHj2a7t271zoXcTFKRhg1VluNR4kaqOoAFScOoY+p28urOHz4"
        @"MEIIRQWjBpFGiZe7GBiToOPpWoaCq+jUSlPnUPCFlGxdzeFBoTWGbs1mM4MHD2bkyJHcdNNNXm3frqys5OjRo7J6+ti2uLLVHYpW"
        @"1QHKj+33OIBGW+98QElJCZmZmT7p32dnZ1dvDL2YK20aFl9rvGQyKNgg1TkZVEVWVlb1RozKU55/tVotffr0YeTIkQwbNozAwIb1"
        @"0ffu3Su7FhGNFn10a1zH5GdavUXVkCOJy04KXaRdVm/+/PmqhmwZP358ddpms1mkp6eL4uLiOvUdLrd4YV+5eGFfuXC46g4vV1xc"
        @"LNLT04XZbK5Ov127duLll18Wx48fV8X2efPmyYfWiU4SiUtP+CJMjLoJxr7+taII2ffdd58qhVfFqFGjPGlfEGErNjZWzJ07t8Hx"
        @"A1euXCkSExNrONbs2bNVtVsIIf785z/Llpf5mv4i9rUNzd8Bwh54TQSPflJWLzExUdVC7NKliwBEq4H3i8ABYwUXRNi+5pprxObN"
        @"mxWntX37dpGWllZ9vkajEUOHDvVZSLrWrVvLllfIPekibMKrzd8BLD2Hi5hXlEW63L17tyoFWFZWJgwGT8SwyGmLRNLqYpH40RFh"
        @"vPJ8JUqSJEaPHi1OnDhRZzqnTp0SkyZNElqttvq81NRUn4ah27Vrl6KyipmxVlh6DGn+DqBtFSJarzotNCarrO6UKVNUKcQdO3ac"
        @"b1lW5leHbEtaXSyi//WJ0IXFnndQi0Wkp6cLp9NZfX55ebmYOXOmsNls5++4kBCxcuVKVeyrj8cee0y2nDQmq2j9yRmhbRXa/B0A"
        @"EHGztwjz7+S/eBERESHKy8sbXYhz58713OUBphqVf6GE/Gl6jY9LJScni1WrVolVq1bVCAAdEBAgnnvuORWqVp6Kigpht8u/MJu7"
        @"3SRi39zki8r3TZzAkq1fYv6D/I6f3NxcPvvsM1k9OXbv3g14vhBaF0G3/w370mwsPQaDJJGZmcnAgQMZOHAgmZmZSJLEsGHDKCgo"
        @"4LHHmmaz6ueff66o/2/pPojSrV/6xAafOIBjzQKsvW5TFPTwzTffbHR+VQ5gsHesV09jMBL55ALi39mFwV5zs+V7773H0qVLm3Ri"
        @"aubMmbI6ksGIpcdQHOsW+sQGnzhAedZeXCcOYb62v6xuRkYGa9eubVR+VQ4Q0On3ivT1sW2I+89WIh9/H22rEADGjh2rijMqZfPm"
        @"zaxZs0ZWz/L7W3FlH/DZV0p9Fh/A8dUCAvsqi4fz6KOPVq+595aTJ0+Sk+NZJWv5fd0LQ2vD0nMYsbO3YGhzJW63m4kTJ/KXv/yl"
        @"QXZ4gxCCxx9/XJGute8IHGs+9JktvnOAdQsxpvRUNDewbds2Fi9WFkPwYnbt2uX5Q6Nt0MYJXVgsMS9nVEcoeeedd+jWrVt1FBBf"
        @"8P7777N+/XpZPX1sO4xdeuBYt8hntvjMASoLT+HImE/QHVMU6U+dOpWiIvkFpRezZ88eALSBwV6fW4XGZCUqfSG2weMBj0MmJCRw"
        @"6pT6Xwo/ffo0jzzyiCLdoDsfomj1/6g8Kz9V3FB8GiWsYPEMrNffLrsMHDwzhA0J9FzdA4hJ8vrcGmi0hI57ibBJs5C0erKzs0lI"
        @"SODbb9X9rvajjz5Kbm6urF51iL3lb6ia/8X41AE8oc6WYBsuv9wJYN68eV6vFNq5cycAAe2u9tq+2mh181hPgGpLK0pLS+nevTvz"
        @"589XJe1PPvmEd999V5Fu0J0PKw6x1xh8Hir2zIcvEnjDKAwJHRTpjx8/XvGCkfLycvbt82ymULLDVimm1L7EvLoWXaSdyspKxowZ"
        @"o/ilrS4OHTrEmDFjFL3sGhI7Ye1zFwUfvdSoPJXgcweoOHmEwmWvEzbpdUXbwQoLC7npppuq3+zr4+eff6a83LPC1tRVPuCSNxjs"
        @"HYmd9Q3GLj0QQvD8889z/fXXNyits2fPMmTIEGXRyyWJsAmvULDoFUV7BRpLk0QLL1j4CtqgCMXx7jIzM7n11ltl1w5WvQBKASY0"
        @"RnOj7bwYbasQop9bibXvCAA2bNhA+/btKS6W3/xSRWlpKYMHD662VY7AG0ahDYmmcOnrDbLZW5rEAYSrjFP/fpjQvzyvOLbetm3b"
        @"GDBgQL2FXfX8r28IuLFI+gAiHn6bkLHPgKQhMzOTuLg4Dhw4IHtuVeUr6fIBaEOiCPnTdE7NmqwowpoaNNkXQ0q3f0XxppVETJ2r"
        @"ODDUpk2bGDRoUJ3f8a26q+SGgBuNJBF0xxQiH5+LZDBSUFDAFVdcwRdffFHnKQUFBQwYMICMjAyFeWiIeOQdHOsXe/ZGNhFN+s2g"
        @"/Lf+jsbSiuBzcXuVsHbtWtLS0mqdNDk/BNw0gSYtacOIeXE12uBIXC4XAwYMYMaMS2MhHz58mB49engVzTt41ONog8I5/e6Tapos"
        @"S5M6gHCVkfv8PdiGT/Iq4NGePXtITU2t/lADeIaAT548CaBozkEtAjp0I/aNbwhok4IQgilTpjBmzJjq459++impqanVASWVYLq6"
        @"D7bB48h5ekT9QSJ8QJM6AHiCHOTNGE/kkwu8CraUn5/PrbfeyuTJkykpKTn/UqXRYIhv2t3DutAYol/+EvN1NwOeod3U1FQmTJjA"
        @"wIEDvfpWkaHNlUQ+/j55r96vKLC22kicWxXS1LS65c8E3z2V41P6UpEjPyd+IW3btqVr164sXrwYrS0U+0Lfd5dqxV1J/n+mUrhi"
        @"doNO10UlEvvqGgoWvkzhin+rbJxCG/ySK3D203fQhkYT/dwKsh+6gcqCPMXnHjhwoPotXBsmvxXNV5Rlbqc8q2HTtNqgcKKfXcHZ"
        @"z971W+WDH1uAKsImzsDUtTcnHh/sdUtQhbnbTdiGTPBE3/b1biPhpmTbVxR+/Aal2+Xn82tDF5VI9LMrKNmWQf6/lb8Q+wK/OwBA"
        @"0B1TsA2ZwImnhlJ+cHeD09HHtMHadwTWtGGqRyEtz9pL8YYlONZ+hOvE4QanY0i8gqhnV+BY8xGn//uUihY2jGbhAACtBt5H8Ogn"
        @"yX12pKJQs3LoY9th6tobY5fuBLS9yrMuQWnrIASu7AOUZe7AuecbSneuVxT9TA7T1X2IfGwep99L5+xnyiaFfE2zcQAAS/fBhP9t"
        @"NoXLZnHmwxfxJnyKHJLRgj4qEV2UHY3J6gm2JGnQWFohKitwF52h8mw+FSeP4Dp5VFGwa8VotATfPRXbkPHkvXIfxZs/US9tFXDi"
        @"g+XGDRVdpF3EvrbB8xn2kCi/29NY0QaFi+hnV4rYN/5P6GPa+N2ei6QEIK8ZGFJDJINRhE2cKewfHRGB/e6usd/vshFJEoE3jBL2"
        @"hUdF2PhXauxJaEaSA3CwGRhSq5hSeor4Od+LmJe/FIbEK/xuj1LRx7UT0f/6VMT/d7cwpfbzuz31yH6Adc3AkDpF0geI4BGPisRl"
        @"J0XYhFeFLiLe7zbVJbqIBBE2caZIXHZSBN31iJB0Br/bJCNfAbzVDAyRL9xIuwh/8E2RuDxHhP9tdrN6nupj24nwKW+JxOU5ImzS"
        @"60IXkeB3mxTKmwAPNgNDlDtCeJwIHfeSSFyeI6L+uURY0oYJyWBscjskg1FYe90mop5eKhKX54jQ+18UutAYv5ePlzJJAq4B1F36"
        @"2gRobWFYe9+Jte8I9NFJODYupWTzKpw/bMJdqm4svSo0JivGzt2xdB+EJW0YruMHcKz5EMe6hT5duu1Dfifh+YT8KUA+vFczxWDv"
        @"iLXPCMzdbkSf0J6yfdsp3b2Rsp++xXVsP66co7LfMLgEjRZ9pB19fDLGjtdiTOlJQPLVuI7upWTrFxSt/VA2unczpwAIqxoaWw4M"
        @"8aMxqqFtFYoxpSemlJ4EJKeij22HZAjAlX0IV/ZB3EVncJc6EM4S3MWe0PYaSxCS0ewZIAoMRh/TBn1sG0SZE9exTMoyt1O6ayPO"
        @"3RupPHvaz1eoGkuB26oc4A7AN9tPmwHa4EgM8cnoohLRBAajMVqQTFY0Zk+IdnfJWUSpA3dpMW7HGSpOHqH8l0xVv8zRDBkOLKty"
        @"ACNwgsv4MdCCV5wBooGyqhVBTmCu/+xpoYn5H1AGNUPixgEHgIBaTmjh10MZ0AY4DjXXBB7D4xkt/Lp5h3OVD5cGxY4A9gIN32vd"
        @"QnPmNNABzwQg4BkDuJBiwAHc3IRGtdB0PAh8LaekBdbi/2HKFlFXMqhlG0Bda6QigR14ugotXP7kAF3xdPVrUNfGkBxgJFBex/EW"
        @"Lh/K8Az0XVL5ShgCVOD/5qtFGiaVwO2X1KqX3HcuIX9fTIt4X/mqxbwbCpQ2g4tqEWVSBiiLxuEF1+N5jvj74lqkfskGlG+99pJw"
        @"YHUzuMgWqV3W0gQ9NwkYQzNcTv4bltPAZC4d2PMpEcBsmtnGkt+YOIE3gDCZuvIpscCreLzQ3wXyW5HT58rcd9GxGkAAnlUmS/Es"
        @"OPB3If3a5DSwBBiGilP2vtpMr8Uz9PgHPLNP7YEEwAZYAfkvSfw2KcUzGVcIHAUygZ+BTcBOPH17Vfl/SSOPxm2PDYQAAAAASUVO"
        @"RK5CYII=";
}
