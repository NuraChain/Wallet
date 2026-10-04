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

@interface NuraBrowserBridge : NSObject <WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate>

@property (nonatomic, weak) WKWebView *host;
@property (nonatomic, strong) NSMutableDictionary<NSString *, WKWebView *> *pages;
@property (nonatomic, strong) NSString *dappScript;
@property (nonatomic, assign) BOOL desktop;

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
    @"               'reloadTab','backTab','forwardTab','setDappScript','dappReply','dappEmit'];"
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
