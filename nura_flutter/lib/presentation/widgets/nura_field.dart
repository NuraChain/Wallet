import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'nura_text.dart';

/// A text input, with the glass treatment the design gives every field.
///
/// `obscure` is a constructor argument rather than a separate widget so that the reveal toggle, the
/// height and the padding cannot drift between the two. The Tauri build had them as two components
/// and they had already drifted — the password field was 48px tall and the text field 44px.
class NuraTextField extends StatefulWidget {
  const NuraTextField({
    super.key,
    required this.controller,
    this.label,
    this.hint,
    this.obscure = false,
    this.onSubmitted,
    this.onChanged,
    this.leading,
    this.trailing,
    this.keyboardType,
    this.textDirection,
    this.autofocus = false,
    this.enabled = true,
    this.maxLines = 1,
  });

  final TextEditingController controller;
  final String? label;
  final String? hint;

  /// Masks the content and offers a reveal toggle.
  final bool obscure;

  final ValueChanged<String>? onSubmitted;
  final ValueChanged<String>? onChanged;
  final Widget? leading;
  final Widget? trailing;
  final TextInputType? keyboardType;

  /// Pins the field's own direction.
  ///
  /// A recovery phrase, an address or an RPC URL is not language: typed into a Persian screen it
  /// must still run left to right, or the caret jumps and the value reads back reversed.
  final TextDirection? textDirection;

  final bool autofocus;
  final bool enabled;
  final int maxLines;

  @override
  State<NuraTextField> createState() => _NuraTextFieldState();
}

class _NuraTextFieldState extends State<NuraTextField> {
  late bool _hidden = widget.obscure;
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    final field = Focus(
      onFocusChange: (value) => setState(() => _focused = value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        constraints: BoxConstraints(
          minHeight: widget.maxLines > 1
              ? NuraMetrics.actionHeight
              : NuraMetrics.actionHeight,
        ),
        decoration: BoxDecoration(
          color: colors.inputBg,
          borderRadius: BorderRadius.circular(NuraMetrics.radiusMedium),
          border: Border.all(
            color: _focused ? colors.inputPrimary : colors.inputNormal,
          ),
        ),
        padding: const EdgeInsets.symmetric(horizontal: NuraMetrics.gap),
        child: Row(
          children: <Widget>[
            if (widget.leading != null) ...<Widget>[
              IconTheme.merge(
                data: IconThemeData(color: colors.txtMuted, size: 16),
                child: widget.leading!,
              ),
              const SizedBox(width: NuraMetrics.gapSmall),
            ],
            Expanded(
              child: TextField(
                controller: widget.controller,
                obscureText: _hidden,
                enabled: widget.enabled,
                autofocus: widget.autofocus,
                maxLines: widget.obscure ? 1 : widget.maxLines,
                keyboardType: widget.keyboardType,
                textDirection: widget.textDirection,
                style: context.type.small,
                cursorColor: colors.btnPrimary,
                onChanged: widget.onChanged,
                onSubmitted: widget.onSubmitted,
                decoration: InputDecoration(
                  isDense: true,
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(vertical: 12),
                  hintText: widget.hint,
                  hintStyle: context.type.small.copyWith(
                    color: colors.txtMuted,
                  ),
                ),
              ),
            ),
            if (widget.obscure)
              _RevealToggle(
                hidden: _hidden,
                onToggle: () => setState(() => _hidden = !_hidden),
              ),
            if (widget.trailing != null) ...<Widget>[
              const SizedBox(width: NuraMetrics.gapSmall),
              widget.trailing!,
            ],
          ],
        ),
      ),
    );

    if (widget.label == null) {
      return field;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        NuraText(widget.label!),
        const SizedBox(height: NuraMetrics.gapSmall),
        field,
      ],
    );
  }
}

class _RevealToggle extends StatelessWidget {
  const _RevealToggle({required this.hidden, required this.onToggle});

  final bool hidden;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: hidden ? 'Show' : 'Hide',
      child: InkResponse(
        onTap: onToggle,
        radius: 18,
        child: Icon(
          hidden ? Icons.visibility_outlined : Icons.visibility_off_outlined,
          size: 18,
          color: context.colors.txtMuted,
        ),
      ),
    );
  }
}

/// A checkbox with its label, both of which toggle it.
///
/// The whole row is the target and it is at least 40px tall. A 20px box alone is below every
/// platform's minimum touch target, and this control gates the "I wrote the phrase down" step —
/// which is exactly the one a user must not be able to tick by accident or miss by a few pixels.
class NuraCheckbox extends StatelessWidget {
  const NuraCheckbox({
    super.key,
    required this.checked,
    required this.onToggle,
    this.text,
    this.child,
  }) : assert(text != null || child != null, 'a checkbox needs a label');

  final bool checked;
  final VoidCallback onToggle;
  final String? text;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Semantics(
      checked: checked,
      child: InkWell(
        onTap: onToggle,
        borderRadius: BorderRadius.circular(NuraMetrics.radiusSmall),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 40),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: <Widget>[
              Container(
                width: 20,
                height: 20,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: colors.inputBg,
                  borderRadius: BorderRadius.circular(NuraMetrics.gapTight),
                  border: Border.all(color: colors.inputNormal),
                ),
                child: checked
                    ? Icon(Icons.check, size: 16, color: colors.txtNormal)
                    : null,
              ),
              const SizedBox(width: NuraMetrics.gapSmall),
              Expanded(child: child ?? NuraText(text!)),
            ],
          ),
        ),
      ),
    );
  }
}
