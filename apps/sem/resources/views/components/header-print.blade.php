<div class="col-sm-4 invoice-col">
    {{ __('From') }}
    <address>
        <strong>{{ $factoryName }}</strong><br>
        {{ $factoryAddress }}<br>
        {{ $factoryZipcode }}, {{ $factoryCity }}<br>
        {{ __('general_content.phone_trans_key') }}: {{ $factoryPhoneNumber }}<br>
        Email: {{ $factoryMail }}
    </address>
</div>
<!-- /.col -->
<div class="col-sm-4 invoice-col">
    {{ __('To') }}
    <address>
        <strong>{{ $companieLabel }}</strong> - <strong>{{ $companieCivility }} - {{ $companieFirstName }}  {{ $companieName }}</strong><br>
        {{ $companieAdress }}<br>
        {{ $companieZipcode }}, {{ $companieCity }}<br>
        {{ $companieCountry }}<br>
        {{ __('general_content.phone_trans_key') }}: {{ $companieNumber }}<br>
        Email: {{ $companieMail }}
    </address>
</div>
<!-- /.col -->
<div class="col-sm-4 invoice-col">
    <h1>{{  $documentName }} #{{  $code }}</h1>
    <b>{{ __('Your Ref:') }}</b> {{ $customerReference }}<br>
</div>
<!-- /.col -->