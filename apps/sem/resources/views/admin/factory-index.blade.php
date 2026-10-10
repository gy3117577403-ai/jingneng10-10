@extends('adminlte::page')

@section('title', __('general_content.your_company_trans_key'))

@section('content_header')
    <h1>{{ __('general_content.your_company_trans_key') }}</h1>
@stop

@section('content')
<div class="card">
    <div class="card-header p-2">
        <ul class="nav nav-pills">
            <li class="nav-item"><a class="nav-link active" href="#Settings" data-toggle="tab">{{ __('general_content.factory_settings_trans_key') }}</a></li>
            <li class="nav-item"><a class="nav-link" href="#Announcement" data-toggle="tab">{{ __('general_content.announcements_trans_key') }}</a></li>
            <li class="nav-item"><a class="nav-link" href="#CustomFields" data-toggle="tab">{{ __('general_content.custom_fields_trans_key') }}</a></li>
            <li class="nav-item"><a class="nav-link" href="#DocumentCodeTemplates" data-toggle="tab">{{ __('general_content.document_code_templates_trans_key') }}</a></li>
            
        </ul>
    </div>
    <div class="card-body">
        <div class="tab-content">
            <div class="tab-pane active" id="Settings">
                @include('include.alert-result')
                <form method="POST" action="{{ route('admin.factory.update') }}" enctype="multipart/form-data">
                @csrf
                
                    <x-adminlte-card title="{{ __('general_content.general_information_trans_key') }}" theme="primary" collapsible maximizable>
                        <div class="row">
                            <div class="col-12">
                                <label for="name">{{ __('general_content.name_company_trans_key') }}</label>
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <span class="input-group-text"><i class="fas fa-building"></i></span>
                                    </div>
                                    <input type="text" class="form-control" name="name"  id="name" value="{{ $Factory->name }}" placeholder="{{ __('general_content.name_company_trans_key') }}">
                                </div>
                            </div>
                        </div>
                        <hr>
                        <div class="row">
                            <div class="col-12">
                                <label for="address">{{ __('general_content.adress_name_trans_key') }}</label>
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <span class="input-group-text"><i class="fas fa-map-marker-alt"></i></span>
                                    </div>
                                    <input type="text" class="form-control" name="address"  id="address" value="{{ $Factory->address }}"  placeholder="{{ __('general_content.adress_name_trans_key') }}">
                                </div>
                            </div>
                        </div>
                        <hr>
                        <div class="row">
                            <div class="form-group col-md-4">
                                <label for="zipcode">{{ __('general_content.postal_code_trans_key') }}</label>
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <span class="input-group-text"><i class="fas fa-map"></i></span>
                                    </div>
                                    <input type="text" class="form-control" name="zipcode"  id="zipcode"  value="{{ $Factory->zipcode }}"  placeholder="{{ __('general_content.postal_code_trans_key') }}">
                                </div>
                            </div>
                            <div class="form-group col-md-4">
                                <label for="city">{{ __('general_content.capacity_trans_key') }}</label>
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <span class="input-group-text"><i class="fas fa-city"></i></span>
                                    </div>
                                    <input type="text" class="form-control" name="city"  id="city" value="{{ $Factory->city }}"  placeholder="{{ __('general_content.capacity_trans_key') }}">
                                </div>
                            </div>
                            <div class="form-group col-md-4">
                                <label for="country">{{ __('general_content.country_trans_key') }}</label>
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <span class="input-group-text"><i class="fas fa-globe-africa"></i></span>
                                    </div>
                                    <select id="country" name="country" class="form-control">
                                        @if($Factory->country)
                                        <option value="{{ $Factory->country }}">{{ $Factory->country }}</option>
                                        @endif
                                        <option value="Afghanistan">{{ __('Afghanistan') }}</option>
                                        <option value="Åland Islands">{{ __('Åland Islands') }}</option>
                                        <option value="Albania">{{ __('Albania') }}</option>
                                        <option value="Algeria">{{ __('Algeria') }}</option>
                                        <option value="American Samoa">{{ __('American Samoa') }}</option>
                                        <option value="Andorra">{{ __('Andorra') }}</option>
                                        <option value="Angola">{{ __('Angola') }}</option>
                                        <option value="Anguilla">{{ __('Anguilla') }}</option>
                                        <option value="Antarctica">{{ __('Antarctica') }}</option>
                                        <option value="Antigua and Barbuda">{{ __('Antigua and Barbuda') }}</option>
                                        <option value="Argentina">{{ __('Argentina') }}</option>
                                        <option value="Armenia">{{ __('Armenia') }}</option>
                                        <option value="Aruba">{{ __('Aruba') }}</option>
                                        <option value="Australia">{{ __('Australia') }}</option>
                                        <option value="Austria">{{ __('Austria') }}</option>
                                        <option value="Azerbaijan">{{ __('Azerbaijan') }}</option>
                                        <option value="Bahamas">{{ __('Bahamas') }}</option>
                                        <option value="Bahrain">{{ __('Bahrain') }}</option>
                                        <option value="Bangladesh">{{ __('Bangladesh') }}</option>
                                        <option value="Barbados">{{ __('Barbados') }}</option>
                                        <option value="Belarus">{{ __('Belarus') }}</option>
                                        <option value="Belgium">{{ __('Belgium') }}</option>
                                        <option value="Belize">{{ __('Belize') }}</option>
                                        <option value="Benin">{{ __('Benin') }}</option>
                                        <option value="Bermuda">{{ __('Bermuda') }}</option>
                                        <option value="Bhutan">{{ __('Bhutan') }}</option>
                                        <option value="Bolivia">{{ __('Bolivia') }}</option>
                                        <option value="Bosnia and Herzegovina">{{ __('Bosnia and Herzegovina') }}</option>
                                        <option value="Botswana">{{ __('Botswana') }}</option>
                                        <option value="Bouvet Island">{{ __('Bouvet Island') }}</option>
                                        <option value="Brazil">{{ __('Brazil') }}</option>
                                        <option value="British Indian Ocean Territory">{{ __('British Indian Ocean Territory') }}</option>
                                        <option value="Brunei Darussalam">{{ __('Brunei Darussalam') }}</option>
                                        <option value="Bulgaria">{{ __('Bulgaria') }}</option>
                                        <option value="Burkina Faso">{{ __('Burkina Faso') }}</option>
                                        <option value="Burundi">{{ __('Burundi') }}</option>
                                        <option value="Cambodia">{{ __('Cambodia') }}</option>
                                        <option value="Cameroon">{{ __('Cameroon') }}</option>
                                        <option value="Canada">{{ __('Canada') }}</option>
                                        <option value="Cape Verde">{{ __('Cape Verde') }}</option>
                                        <option value="Cayman Islands">{{ __('Cayman Islands') }}</option>
                                        <option value="Central African Republic">{{ __('Central African Republic') }}</option>
                                        <option value="Chad">{{ __('Chad') }}</option>
                                        <option value="Chile">{{ __('Chile') }}</option>
                                        <option value="China">{{ __('China') }}</option>
                                        <option value="Christmas Island">{{ __('Christmas Island') }}</option>
                                        <option value="Cocos (Keeling) Islands">{{ __('Cocos (Keeling) Islands') }}</option>
                                        <option value="Colombia">{{ __('Colombia') }}</option>
                                        <option value="Comoros">{{ __('Comoros') }}</option>
                                        <option value="Congo">{{ __('Congo') }}</option>
                                        <option value="Congo, The Democratic Republic of The">{{ __('Congo, The Democratic Republic of The') }}</option>
                                        <option value="Cook Islands">{{ __('Cook Islands') }}</option>
                                        <option value="Costa Rica">{{ __('Costa Rica') }}</option>
                                        <option value="Cote D'ivoire">{{ __('Cote D\'ivoire') }}</option>
                                        <option value="Croatia">{{ __('Croatia') }}</option>
                                        <option value="Cuba">{{ __('Cuba') }}</option>
                                        <option value="Cyprus">{{ __('Cyprus') }}</option>
                                        <option value="Czech Republic">{{ __('Czech Republic') }}</option>
                                        <option value="Denmark">{{ __('Denmark') }}</option>
                                        <option value="Djibouti">{{ __('Djibouti') }}</option>
                                        <option value="Dominica">{{ __('Dominica') }}</option>
                                        <option value="Dominican Republic">{{ __('Dominican Republic') }}</option>
                                        <option value="Ecuador">{{ __('Ecuador') }}</option>
                                        <option value="Egypt">{{ __('Egypt') }}</option>
                                        <option value="El Salvador">{{ __('El Salvador') }}</option>
                                        <option value="Equatorial Guinea">{{ __('Equatorial Guinea') }}</option>
                                        <option value="Eritrea">{{ __('Eritrea') }}</option>
                                        <option value="Estonia">{{ __('Estonia') }}</option>
                                        <option value="Ethiopia">{{ __('Ethiopia') }}</option>
                                        <option value="Falkland Islands (Malvinas)">{{ __('Falkland Islands (Malvinas)') }}</option>
                                        <option value="Faroe Islands">{{ __('Faroe Islands') }}</option>
                                        <option value="Fiji">{{ __('Fiji') }}</option>
                                        <option value="Finland">{{ __('Finland') }}</option>
                                        <option value="France">{{ __('France') }}</option>
                                        <option value="French Guiana">{{ __('French Guiana') }}</option>
                                        <option value="French Polynesia">{{ __('French Polynesia') }}</option>
                                        <option value="French Southern Territories">{{ __('French Southern Territories') }}</option>
                                        <option value="Gabon">{{ __('Gabon') }}</option>
                                        <option value="Gambia">{{ __('Gambia') }}</option>
                                        <option value="Georgia">{{ __('Georgia') }}</option>
                                        <option value="Germany">{{ __('Germany') }}</option>
                                        <option value="Ghana">{{ __('Ghana') }}</option>
                                        <option value="Gibraltar">{{ __('Gibraltar') }}</option>
                                        <option value="Greece">{{ __('Greece') }}</option>
                                        <option value="Greenland">{{ __('Greenland') }}</option>
                                        <option value="Grenada">{{ __('Grenada') }}</option>
                                        <option value="Guadeloupe">{{ __('Guadeloupe') }}</option>
                                        <option value="Guam">{{ __('Guam') }}</option>
                                        <option value="Guatemala">{{ __('Guatemala') }}</option>
                                        <option value="Guernsey">{{ __('Guernsey') }}</option>
                                        <option value="Guinea">{{ __('Guinea') }}</option>
                                        <option value="Guinea-bissau">{{ __('Guinea-bissau') }}</option>
                                        <option value="Guyana">{{ __('Guyana') }}</option>
                                        <option value="Haiti">{{ __('Haiti') }}</option>
                                        <option value="Heard Island and Mcdonald Islands">{{ __('Heard Island and Mcdonald Islands') }}</option>
                                        <option value="Holy See (Vatican City State)">{{ __('Holy See (Vatican City State)') }}</option>
                                        <option value="Honduras">{{ __('Honduras') }}</option>
                                        <option value="Hong Kong">{{ __('Hong Kong') }}</option>
                                        <option value="Hungary">{{ __('Hungary') }}</option>
                                        <option value="Iceland">{{ __('Iceland') }}</option>
                                        <option value="India">{{ __('India') }}</option>
                                        <option value="Indonesia">{{ __('Indonesia') }}</option>
                                        <option value="Iran, Islamic Republic of">{{ __('Iran, Islamic Republic of') }}</option>
                                        <option value="Iraq">{{ __('Iraq') }}</option>
                                        <option value="Ireland">{{ __('Ireland') }}</option>
                                        <option value="Isle of Man">{{ __('Isle of Man') }}</option>
                                        <option value="Israel">{{ __('Israel') }}</option>
                                        <option value="Italy">{{ __('Italy') }}</option>
                                        <option value="Jamaica">{{ __('Jamaica') }}</option>
                                        <option value="Japan">{{ __('Japan') }}</option>
                                        <option value="Jersey">{{ __('Jersey') }}</option>
                                        <option value="Jordan">{{ __('Jordan') }}</option>
                                        <option value="Kazakhstan">{{ __('Kazakhstan') }}</option>
                                        <option value="Kenya">{{ __('Kenya') }}</option>
                                        <option value="Kiribati">{{ __('Kiribati') }}</option>
                                        <option value="Korea, Democratic People's Republic of">{{ __('Korea, Democratic People\'s Republic of') }}</option>
                                        <option value="Korea, Republic of">{{ __('Korea, Republic of') }}</option>
                                        <option value="Kuwait">{{ __('Kuwait') }}</option>
                                        <option value="Kyrgyzstan">{{ __('Kyrgyzstan') }}</option>
                                        <option value="Lao People's Democratic Republic">{{ __('Lao People\'s Democratic Republic') }}</option>
                                        <option value="Latvia">{{ __('Latvia') }}</option>
                                        <option value="Lebanon">{{ __('Lebanon') }}</option>
                                        <option value="Lesotho">{{ __('Lesotho') }}</option>
                                        <option value="Liberia">{{ __('Liberia') }}</option>
                                        <option value="Libyan Arab Jamahiriya">{{ __('Libyan Arab Jamahiriya') }}</option>
                                        <option value="Liechtenstein">{{ __('Liechtenstein') }}</option>
                                        <option value="Lithuania">{{ __('Lithuania') }}</option>
                                        <option value="Luxembourg">{{ __('Luxembourg') }}</option>
                                        <option value="Macao">{{ __('Macao') }}</option>
                                        <option value="Macedonia, The Former Yugoslav Republic of">{{ __('Macedonia, The Former Yugoslav Republic of') }}</option>
                                        <option value="Madagascar">{{ __('Madagascar') }}</option>
                                        <option value="Malawi">{{ __('Malawi') }}</option>
                                        <option value="Malaysia">{{ __('Malaysia') }}</option>
                                        <option value="Maldives">{{ __('Maldives') }}</option>
                                        <option value="Mali">{{ __('Mali') }}</option>
                                        <option value="Malta">{{ __('Malta') }}</option>
                                        <option value="Marshall Islands">{{ __('Marshall Islands') }}</option>
                                        <option value="Martinique">{{ __('Martinique') }}</option>
                                        <option value="Mauritania">{{ __('Mauritania') }}</option>
                                        <option value="Mauritius">{{ __('Mauritius') }}</option>
                                        <option value="Mayotte">{{ __('Mayotte') }}</option>
                                        <option value="Mexico">{{ __('Mexico') }}</option>
                                        <option value="Micronesia, Federated States of">{{ __('Micronesia, Federated States of') }}</option>
                                        <option value="Moldova, Republic of">{{ __('Moldova, Republic of') }}</option>
                                        <option value="Monaco">{{ __('Monaco') }}</option>
                                        <option value="Mongolia">{{ __('Mongolia') }}</option>
                                        <option value="Montenegro">{{ __('Montenegro') }}</option>
                                        <option value="Montserrat">{{ __('Montserrat') }}</option>
                                        <option value="Morocco">{{ __('Morocco') }}</option>
                                        <option value="Mozambique">{{ __('Mozambique') }}</option>
                                        <option value="Myanmar">{{ __('Myanmar') }}</option>
                                        <option value="Namibia">{{ __('Namibia') }}</option>
                                        <option value="Nauru">{{ __('Nauru') }}</option>
                                        <option value="Nepal">{{ __('Nepal') }}</option>
                                        <option value="Netherlands">{{ __('Netherlands') }}</option>
                                        <option value="Netherlands Antilles">{{ __('Netherlands Antilles') }}</option>
                                        <option value="New Caledonia">{{ __('New Caledonia') }}</option>
                                        <option value="New Zealand">{{ __('New Zealand') }}</option>
                                        <option value="Nicaragua">{{ __('Nicaragua') }}</option>
                                        <option value="Niger">{{ __('Niger') }}</option>
                                        <option value="Nigeria">{{ __('Nigeria') }}</option>
                                        <option value="Niue">{{ __('Niue') }}</option>
                                        <option value="Norfolk Island">{{ __('Norfolk Island') }}</option>
                                        <option value="Northern Mariana Islands">{{ __('Northern Mariana Islands') }}</option>
                                        <option value="Norway">{{ __('Norway') }}</option>
                                        <option value="Oman">{{ __('Oman') }}</option>
                                        <option value="Pakistan">{{ __('Pakistan') }}</option>
                                        <option value="Palau">{{ __('Palau') }}</option>
                                        <option value="Palestinian Territory, Occupied">{{ __('Palestinian Territory, Occupied') }}</option>
                                        <option value="Panama">{{ __('Panama') }}</option>
                                        <option value="Papua New Guinea">{{ __('Papua New Guinea') }}</option>
                                        <option value="Paraguay">{{ __('Paraguay') }}</option>
                                        <option value="Peru">{{ __('Peru') }}</option>
                                        <option value="Philippines">{{ __('Philippines') }}</option>
                                        <option value="Pitcairn">{{ __('Pitcairn') }}</option>
                                        <option value="Poland">{{ __('Poland') }}</option>
                                        <option value="Portugal">{{ __('Portugal') }}</option>
                                        <option value="Puerto Rico">{{ __('Puerto Rico') }}</option>
                                        <option value="Qatar">{{ __('Qatar') }}</option>
                                        <option value="Reunion">{{ __('Reunion') }}</option>
                                        <option value="Romania">{{ __('Romania') }}</option>
                                        <option value="Russian Federation">{{ __('Russian Federation') }}</option>
                                        <option value="Rwanda">{{ __('Rwanda') }}</option>
                                        <option value="Saint Helena">{{ __('Saint Helena') }}</option>
                                        <option value="Saint Kitts and Nevis">{{ __('Saint Kitts and Nevis') }}</option>
                                        <option value="Saint Lucia">{{ __('Saint Lucia') }}</option>
                                        <option value="Saint Pierre and Miquelon">{{ __('Saint Pierre and Miquelon') }}</option>
                                        <option value="Saint Vincent and The Grenadines">{{ __('Saint Vincent and The Grenadines') }}</option>
                                        <option value="Samoa">{{ __('Samoa') }}</option>
                                        <option value="San Marino">{{ __('San Marino') }}</option>
                                        <option value="Sao Tome and Principe">{{ __('Sao Tome and Principe') }}</option>
                                        <option value="Saudi Arabia">{{ __('Saudi Arabia') }}</option>
                                        <option value="Senegal">{{ __('Senegal') }}</option>
                                        <option value="Serbia">{{ __('Serbia') }}</option>
                                        <option value="Seychelles">{{ __('Seychelles') }}</option>
                                        <option value="Sierra Leone">{{ __('Sierra Leone') }}</option>
                                        <option value="Singapore">{{ __('Singapore') }}</option>
                                        <option value="Slovakia">{{ __('Slovakia') }}</option>
                                        <option value="Slovenia">{{ __('Slovenia') }}</option>
                                        <option value="Solomon Islands">{{ __('Solomon Islands') }}</option>
                                        <option value="Somalia">{{ __('Somalia') }}</option>
                                        <option value="South Africa">{{ __('South Africa') }}</option>
                                        <option value="South Georgia and The South Sandwich Islands">{{ __('South Georgia and The South Sandwich Islands') }}</option>
                                        <option value="Spain">{{ __('Spain') }}</option>
                                        <option value="Sri Lanka">{{ __('Sri Lanka') }}</option>
                                        <option value="Sudan">{{ __('Sudan') }}</option>
                                        <option value="Suriname">{{ __('Suriname') }}</option>
                                        <option value="Svalbard and Jan Mayen">{{ __('Svalbard and Jan Mayen') }}</option>
                                        <option value="Swaziland">{{ __('Swaziland') }}</option>
                                        <option value="Sweden">{{ __('Sweden') }}</option>
                                        <option value="Switzerland">{{ __('Switzerland') }}</option>
                                        <option value="Syrian Arab Republic">{{ __('Syrian Arab Republic') }}</option>
                                        <option value="Taiwan">{{ __('Taiwan') }}</option>
                                        <option value="Tajikistan">{{ __('Tajikistan') }}</option>
                                        <option value="Tanzania, United Republic of">{{ __('Tanzania, United Republic of') }}</option>
                                        <option value="Thailand">{{ __('Thailand') }}</option>
                                        <option value="Timor-leste">{{ __('Timor-leste') }}</option>
                                        <option value="Togo">{{ __('Togo') }}</option>
                                        <option value="Tokelau">{{ __('Tokelau') }}</option>
                                        <option value="Tonga">{{ __('Tonga') }}</option>
                                        <option value="Trinidad and Tobago">{{ __('Trinidad and Tobago') }}</option>
                                        <option value="Tunisia">{{ __('Tunisia') }}</option>
                                        <option value="Turkey">{{ __('Turkey') }}</option>
                                        <option value="Turkmenistan">{{ __('Turkmenistan') }}</option>
                                        <option value="Turks and Caicos Islands">{{ __('Turks and Caicos Islands') }}</option>
                                        <option value="Tuvalu">{{ __('Tuvalu') }}</option>
                                        <option value="Uganda">{{ __('Uganda') }}</option>
                                        <option value="Ukraine">{{ __('Ukraine') }}</option>
                                        <option value="United Arab Emirates">{{ __('United Arab Emirates') }}</option>
                                        <option value="United Kingdom">{{ __('United Kingdom') }}</option>
                                        <option value="United States">{{ __('United States') }}</option>
                                        <option value="United States Minor Outlying Islands">{{ __('United States Minor Outlying Islands') }}</option>
                                        <option value="Uruguay">{{ __('Uruguay') }}</option>
                                        <option value="Uzbekistan">{{ __('Uzbekistan') }}</option>
                                        <option value="Vanuatu">{{ __('Vanuatu') }}</option>
                                        <option value="Venezuela">{{ __('Venezuela') }}</option>
                                        <option value="Viet Nam">{{ __('Viet Nam') }}</option>
                                        <option value="Virgin Islands, British">{{ __('Virgin Islands, British') }}</option>
                                        <option value="Virgin Islands, U.S.">{{ __('Virgin Islands, U.S.') }}</option>
                                        <option value="Wallis and Futuna">{{ __('Wallis and Futuna') }}</option>
                                        <option value="Western Sahara">{{ __('Western Sahara') }}</option>
                                        <option value="Yemen">{{ __('Yemen') }}</option>
                                        <option value="Zambia">{{ __('Zambia') }}</option>
                                        <option value="Zimbabwe">{{ __('Zimbabwe') }}</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <hr>
                        <div class="row">
                            <div class="form-group col-md-4">
                                <label for="phone_number">{{ __('general_content.phone_trans_key') }}</label>
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <span class="input-group-text"><i class="fas fa-phone"></i></span>
                                    </div>
                                    <input type="text" class="form-control" name="phone_number"  id="phone_number"  value="{{ $Factory->phone_number }}"  placeholder="{{ __('general_content.phone_trans_key') }}">
                                </div>
                            </div>
                            <div class="form-group col-md-4">
                                <label for="mail">{{ __('general_content.email_trans_key') }}</label>
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <span class="input-group-text">@</span>
                                    </div>
                                    <input type="email" class="form-control" name="mail"  id="mail" value="{{ $Factory->mail }}"  placeholder="{{ __('general_content.email_trans_key') }}">
                                </div>
                            </div>
                            <div class="form-group col-md-4">
                                <label for="web_site">{{ __('general_content.web_link_trans_key') }}</label>
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <span class="input-group-text"><i class="fab fa-internet-explorer"></i></span>
                                    </div>
                                    <input type="text" class="form-control"  name="web_site" id="web_site" value="{{ $Factory->web_site }}" placeholder="{{ __('general_content.web_link_trans_key') }}">
                                </div>
                            </div>
                        </div>
                    </x-adminlte-card>

                    <x-adminlte-card title="{{ __('general_content.administrative_information_trans_key') }}" theme="secondary" collapsible maximizable>
                        <div class="row">
                            <div class="col-3">
                                <input type="text" class="form-control" name="siren" id="siren" value="{{ $Factory->siren }}" placeholder="{{ __('general_content.siren_trans_key') }}">
                            </div>
                            <div class="col-3">
                                <input type="text" class="form-control" name="nat_regis_num" id="nat_regis_num" value="{{ $Factory->nat_regis_num }}" placeholder="{{ __('general_content.nat_regis_number_trans_key') }}">
                            </div>
                            <div class="col-3">
                                <input type="text" class="form-control" name="vat_num" id="vat_num" value="{{ $Factory->vat_num }}" placeholder="{{ __('general_content.vat_number_trans_key') }}">
                            </div>
                            <div class="col-3">
                                <input type="text" class="form-control" name="share_capital" id="share_capital" value="{{ $Factory->share_capital }}" placeholder="{{ __('general_content.share_capital_trans_key') }}">
                            </div>
                        </div>
                        <div class="row mt-2">
                            <div class="col-8">
                                <input type="text" class="form-control" name="iban" id="iban" value="{{ $Factory->iban }}" placeholder="{{ __('general_content.iban_trans_key') }}">
                            </div>
                            <div class="col-4">
                                <input type="text" class="form-control" name="bic" id="bic" value="{{ $Factory->bic }}" placeholder="{{ __('general_content.bic_trans_key') }}">
                            </div>
                        </div>
                    </x-adminlte-card>

                    <x-adminlte-card title="{{ __('general_content.default_value_trans_key') }}" theme="info" collapsible maximizable>
                        <div class="row">
                            <div class="form-group col-md-6">
                                <label for="add_day_validity_quote">{{ __('general_content.add_value_day_offer_trans_key') }}</label>
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <span class="input-group-text">+</span>
                                    </div>
                                    <input type="number" class="form-control" name="add_day_validity_quote" id="add_day_validity_quote" value="{{ $Factory->add_day_validity_quote }}" >
                                    <div class="input-group-append">
                                        <span class="input-group-text">{{ __('general_content.day_trans_key') }}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="form-group col-md-6">
                                <label for="add_delivery_delay_order">{{ __('general_content.add_value_day_delivery_trans_key') }}</label>
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <span class="input-group-text">+</span>
                                    </div>
                                    <input type="number" class="form-control" name="add_delivery_delay_order" id="add_delivery_delay_order" value="{{ $Factory->add_delivery_delay_order }}" >
                                    <div class="input-group-append">
                                        <span class="input-group-text">{{ __('general_content.day_trans_key') }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <hr>
                        <div class="row">
                            <div class="col-8">
                                <label for="accounting_vats_id">{{ __('general_content.vat_trans_key') }}</label>
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <span class="input-group-text"><i class="fas fa-percentage"></i></span>
                                    </div>
                                    <select class="form-control"  name="accounting_vats_id" id="accounting_vats_id">
                                        <option value="" >{{ __('general_content.select_vat_trans_key') }}</option>
                                        @foreach ($VATSelect as $item)
                                        <option value="{{ $item->id }}" @if($item->id == $Factory->accounting_vats_id ) Selected @endif >{{ $item->label }}</option>
                                        @endforeach
                                    </select>
                                </div>
                            </div>
                            <div class="col-8">
                                <label for="curency">{{ __('general_content.curency_trans_key') }}</label>
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <span class="input-group-text">$</span>
                                    </div>
                                    <select class="form-control"  name="curency" id="curency" >
                                        <option value="USD" @if('USD' == $Factory->curency ) Selected @endif>{{ __('United States Dollars') }}</option>
                                        <option value="EUR" @if('EUR' == $Factory->curency ) Selected @endif>{{ __('Euro') }}</option>
                                        <option value="CAN" @if('CAN' == $Factory->curency ) Selected @endif>{{ __('Canadian') }}</option>
                                        <option value="GBP" @if('GBP' == $Factory->curency ) Selected @endif>{{ __('United Kingdom Pounds') }}</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <hr>
                        <div class="row">
                            <div class="form-group col-md-6">
                                <label for="fiscal_year_start_month">{{ __('Mois de début d\'exercice comptable') }}</label>
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <span class="input-group-text"><i class="fas fa-calendar-alt"></i></span>
                                    </div>
                                    <select class="form-control" name="fiscal_year_start_month" id="fiscal_year_start_month">
                                        @php
                                            $months = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
                                        @endphp
                                        @foreach($months as $i => $label)
                                            <option value="{{ $i + 1 }}" @if(($Factory->fiscal_year_start_month ?? 1) == $i + 1) selected @endif>
                                                {{ __($label) }}
                                            </option>
                                        @endforeach
                                    </select>
                                </div>
                                <small class="form-text text-muted">{{ __('Set the first month of the fiscal year. February means February 1 through January 31.') }}</small>
                            </div>
                        </div>
                    </x-adminlte-card>

                    <x-adminlte-card title="{{ __('general_content.repots_setting_trans_key') }}" theme="teal" collapsible maximizable>
                        @php($selectedPdfTheme = old('pdf_theme', $Factory->pdf_theme ?? $pdfFallbackTheme))
                        <div class="row">
                            <div class="form-group col-md-3">
                                <div class="form-group">
                                    <label for="pdf_header_font_color">{{ __('general_content.header_font_color_trans_key') }}</label>
                                    <input type="color" class="form-control"  name="pdf_header_font_color" id="pdf_header_font_color" value="{{ $Factory->pdf_header_font_color }}">
                                </div>
                            </div>
                            <div class="form-group col-md-3">
                                <label for="pdf_theme">{{ __('general_content.pdf_theme_trans_key') }}</label>
                                <select class="form-control" name="pdf_theme" id="pdf_theme" required>
                                    @foreach ($pdfThemes as $theme)
                                        <option value="{{ $theme }}" @selected($selectedPdfTheme === $theme)>
                                            {{ $theme }}@if ($theme === $pdfFallbackTheme) ({{ __('general_content.pdf_theme_fallback_trans_key') }})@endif
                                        </option>
                                    @endforeach
                                </select>
                                <small class="form-text text-muted">{{ __('general_content.pdf_theme_help_trans_key') }}</small>
                            </div>
                            <div class="form-group col-md-6">
                                <label for="pdf_custom_css">{{ __('general_content.pdf_custom_css_trans_key') }}</label>
                                <textarea class="form-control" name="pdf_custom_css" id="pdf_custom_css" rows="6" placeholder="{{ __('general_content.pdf_custom_css_placeholder_trans_key') }}">{{ old('pdf_custom_css', $Factory->pdf_custom_css) }}</textarea>
                                <small class="form-text text-muted">{{ __('general_content.pdf_custom_css_help_trans_key') }}</small>
                            </div>
                            <div class="form-group col-md-3">
                                <label for="public_link_cgv">{{ __('general_content.public_link_cgv_trans_key') }}</label>
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <span class="input-group-text"><i class="fab fa-internet-explorer"></i></span>
                                    </div>
                                    <select class="form-control"  name="public_link_cgv" id="public_link_cgv" >
                                        <option value="1"  @if('1' == $Factory->public_link_cgv ) Selected @endif>{{ __('general_content.yes_trans_key') }}</option>
                                        <option value="2" @if('2' == $Factory->public_link_cgv ) Selected @endif>{{ __('general_content.no_trans_key') }}</option>
                                    </select>
                                </div>
                            </div>
                            <div class="form-group col-md-3">
                                <label for="add_cgv_to_pdf">{{ __('general_content.add_cgv_to_quote_order_trans_key') }}</label>
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <span class="input-group-text"><i class="fab fa-internet-explorer"></i></span>
                                    </div>
                                    <select class="form-control"  name="add_cgv_to_pdf" id="add_cgv_to_pdf" >
                                        <option value="1" @if('1' == $Factory->add_cgv_to_pdf ) Selected @endif>{{ __('general_content.yes_trans_key') }}</option>
                                        <option value="2" @if('2' == $Factory->add_cgv_to_pdf ) Selected @endif>{{ __('general_content.no_trans_key') }}</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-6">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <span class="input-group-text"><i class="far fa-image"></i></span>
                                    </div>
                                    <div class="custom-file">
                                        <input type="file" class="custom-file-input" name="cgv_file" id="cgv_file">
                                        <label class="custom-file-label" for="cgv_file">{{ __('general_content.choose_file_trans_key') }}  (pdf | max: 10 240 Ko)</label>
                                    </div>
                                </div>
                            </div>
                            @if( $Factory->cgv_file)
                            <div class="col-3 text-center">
                                <a class="btn btn-info btn-sm " href="{{ asset('/cgv/factory/'. $Factory->cgv_file) }}" target="_blank">{{ __('general_content.show_current_file_trans_key') }}</a>
                            </div>
                            @endif
                        </div>
                    </x-adminlte-card>

                    <x-adminlte-card title="{{ __('general_content.picture_trans_key') }}" theme="warning" collapsible maximizable>
                        @if($Factory->picture)
                        <div class="row">
                            <img src="{{ asset('/images/factory/'. $Factory->picture) }}" style="width:100%;height: auto;" alt="{{ __('Factory Logo') }}" >
                        </div>
                        @endif
                        <div class="row">
                            <div class="input-group">
                                <div class="input-group-prepend">
                                    <span class="input-group-text"><i class="far fa-image"></i></span>
                                </div>
                                <div class="custom-file">
                                    <input type="file" class="custom-file-input" name="picture" id="picture">
                                    <label class="custom-file-label" for="picture">{{ __('general_content.choose_file_trans_key') }}  (peg,png,jpg,gif,svg | max: 10 240 Ko)</label>
                                </div>
                            </div>
                        </div>
                    </x-adminlte-card>

                    <x-adminlte-card title="{{ __('general_content.manufacturing_information_trans_key') }}" theme="purple" collapsible maximizable>
                        <div class="col-8">
                            <label for="task_barre_code">{{ __('general_content.bare_code_type_trans_key') }}</label>
                            <div class="input-group">
                                <div class="input-group-prepend">
                                    <span class="input-group-text"><i class="fas fa-barcode"></i></span>
                                </div>
                                <select class="form-control"  name="task_barre_code" id="task_barre_code">
                                    <option value="EAN2" @if('EAN2' == $Factory->task_barre_code ) Selected @endif >EAN2</option>
                                    <option value="EAN5" @if('EAN5' == $Factory->task_barre_code ) Selected @endif >EAN5</option>
                                    <option value="EAN8" @if('EAN8' == $Factory->task_barre_code ) Selected @endif >EAN8</option>
                                    <option value="EAN13" @if('EAN13' == $Factory->task_barre_code ) Selected @endif >EAN13</option>
                                    <option value="UPCA" @if('UPCA' == $Factory->task_barre_code ) Selected @endif >UPCA</option>
                                    <option value="UPCE" @if('UPCE' == $Factory->task_barre_code ) Selected @endif >UPCE</option>
                                    <option value="CODE11" @if('CODE11' == $Factory->task_barre_code ) Selected @endif >CODE11</option>
                                    <option value="C39" @if('C39' == $Factory->task_barre_code ) Selected @endif >C39</option>
                                </select>
                            </div>
                        </div>
                    </x-adminlte-card>
                    
                    <x-adminlte-card title="{{ __('general_content.modules_trans_key') }}" theme="dark" collapsible maximizable>
                        <div class="row">
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label>{{ __('general_content.construction_site_trans_key') }}</label>
                                    <div>
                                        <input type="hidden" name="enable_construction_site" value="0">
                                        <input type="checkbox" name="enable_construction_site" id="enable_construction_site" value="1" class="mr-2"
                                            @if($Factory->enable_construction_site) checked @endif>
                                        <label for="enable_construction_site" class="mb-0">
                                            {{ __('general_content.enable_trans_key') }}
                                        </label>
                                        <small class="form-text text-muted">{{ __('general_content.construction_site_enable_help_trans_key') }}</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </x-adminlte-card>

                    <div class="modal-footer">
                        <x-adminlte-button class="btn-flat" type="submit" label="{{ __('general_content.submit_trans_key') }}" theme="danger" icon="fas fa-lg fa-save"/>
                    </div>
                </form>
            </div>
            <div class="tab-pane " id="Announcement">
                @include('include.alert-result')
                <form method="POST" action="{{ route('admin.factory.announcement.create') }}" enctype="multipart/form-data">
                    @csrf
                    <x-adminlte-card title="{{ __('general_content.make_an_announcement_trans_key') }}" theme="primary" maximizable>
                        <div class="row">
                            <div class="col-3">
                                <label for="title">{{ __('general_content.title_trans_key') }}</label>
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <span class="input-group-text"><i class="fas fa-tags"></i></span>
                                    </div>
                                    <input type="text" class="form-control" name="title"  id="title" placeholder="{{ __('general_content.title_trans_key') }}">
                                </div>
                            </div>
                            <div class="col-9">
                                <x-FormTextareaComment  comment="..." />
                            </div>
                        </div>
                        <x-slot name="footerSlot">
                            <x-adminlte-button class="btn-flat" type="submit" label="{{ __('general_content.submit_trans_key') }}" theme="danger" icon="fas fa-lg fa-save"/>
                        </x-slot>
                    </x-adminlte-card>
                </form>
                
                <x-adminlte-card title="{{ __('general_content.announcements_trans_key') }}" theme="secondary" maximizable>
                    <div class="table-responsive p-0">
                        <table class="table table-hover">
                            <thead>
                                <tr>
                                    <th>{{ __('general_content.title_trans_key') }}</th>
                                    <th>{{ __('general_content.text_trans_key') }}</th>
                                    <th>{{__('general_content.action_trans_key') }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                @forelse ($AnnouncementLines as $AnnouncementLine)
                                <tr>
                                    <td>{{ $AnnouncementLine->title }}</td>
                                    <td>{{ $AnnouncementLine->comment }}</td>
                                    <td>
                                        <div class="btn-group btn-group-sm">
                                            <a href="{{ route('admin.factory.announcement.delete', ['id' => $AnnouncementLine->id])}}" class="btn btn-danger"><i class="fa fa-lg fa-fw fa-trash"></i></a>
                                        </div>
                                    </td>
                                </tr>
                                @empty
                                    <x-EmptyDataLine col="3" text="{{ __('general_content.no_data_trans_key') }}"  />
                                @endforelse
                            </tbody>
                            <tfoot>
                                <tr>
                                    <th>{{ __('general_content.title_trans_key') }}</th>
                                    <th>{{ __('general_content.text_trans_key') }}</th>
                                    <th>{{__('general_content.action_trans_key') }}</th>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </x-adminlte-card>
            </div>
            <div class="tab-pane " id="CustomFields">
                <div class="row">
                    <div class="col-md-6">
                        <x-adminlte-card title="{{ __('general_content.families_trans_key') }}" theme="primary" maximizable>
                            <div class="table-responsive p-0">
                                <table class="table table-hover">
                                    <thead>
                                        <tr>
                                            <th>{{ __('general_content.name_field_trans_key') }}</th>
                                            <th>{{ __('general_content.type_field_trans_key') }} </th>
                                            <th>{{ __('general_content.custom_fields_options_trans_key') }}</th>
                                            <th>{{ __('general_content.custom_fields_category_trans_key') }}</th>
                                            <th>{{ __('general_content.entity_type_trans_key') }}</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @forelse ($CustomFields as $CustomField)
                                            <tr>
                                                <td>{{ $CustomField->name }}</td>
                                                <td>{{ $CustomField->type }}</td>
                                                <td>{{ collect($CustomField->options ?? [])->implode(', ') }}</td>
                                                <td>{{ $CustomField->category ?? __('general_content.custom_fields_default_category_trans_key') }}</td>
                                                <td>{{ $CustomField->related_type }}</td>
                                                <td></td>
                                            </tr>
                                        @empty
                                            <x-EmptyDataLine col="5" text="{{ __('general_content.no_data_trans_key') }}"  />
                                        @endforelse
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <th>{{ __('general_content.name_field_trans_key') }}</th>
                                            <th>{{ __('general_content.type_field_trans_key') }} </th>
                                            <th>{{ __('general_content.custom_fields_options_trans_key') }}</th>
                                            <th>{{ __('general_content.custom_fields_category_trans_key') }}</th>
                                            <th>{{ __('general_content.entity_type_trans_key') }}</th>
                                            <th></th>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </x-adminlte-card>
                    </div>
                    <div class="col-md-6">
                        <x-adminlte-card title="{{ __('general_content.new_family_trans_key') }}" theme="secondary" maximizable>
                            <form  method="POST" action="{{ route('admin.factory.custom.field.store') }}" class="form-horizontal">
                                @csrf
                                <div class="form-group">
                                    <label for="code">{{ __('general_content.name_field_trans_key') }} :</label>
                                    <div class="input-group">
                                        <div class="input-group-prepend">
                                            <span class="input-group-text"><i class="fas fa-tags"></i></span>
                                        </div>
                                        <input type="text" class="form-control" id="name" name="name" required>
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label for="custom_field_type">{{ __('general_content.type_field_trans_key') }}  :</label>
                                    <div class="input-group">
                                        <div class="input-group-prepend">
                                            <span class="input-group-text"><i class="fas fa-external-link-square-alt"></i></span>
                                        </div>
                                        <select class="form-control" id="custom_field_type" name="type" required>
                                            <option value="text">{{ __('Text') }}</option>
                                            <option value="number">{{ __('Number') }}</option>
                                            <option value="checkbox">{{ __('Checkbox') }}</option>
                                            <option value="date">{{ __('Date') }}</option>
                                            <option value="select">{{ __('general_content.custom_fields_type_select_trans_key') }}</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="form-group" id="custom-field-options-group" style="display: none;">
                                    <label for="options">{{ __('general_content.custom_fields_options_trans_key') }} :</label>
                                    <textarea class="form-control" id="options" name="options" rows="3" placeholder="{{ __('general_content.custom_fields_options_placeholder_trans_key') }}"></textarea>
                                    <small class="form-text text-muted">{{ __('general_content.custom_fields_options_help_trans_key') }}</small>
                                </div>
                                <div class="form-group">
                                    <label for="related_type">{{ __('general_content.entity_type_trans_key') }}  :</label>
                                    <div class="input-group">
                                        <div class="input-group-prepend">
                                            <span class="input-group-text"><i class="fas fa-list"></i></span>
                                        </div>
                                        <select class="form-control" id="related_type" name="related_type" required>
                                            <option value="quote">{{ __('general_content.quote_trans_key') }}</option>
                                            <option value="order">{{ __('general_content.orders_trans_key') }}</option>
                                            <option value="delivery">{{ __('general_content.delivery_notes_trans_key') }}</option>
                                            <option value="invoice">{{ __('general_content.invoice_trans_key') }}</option>
                                            <option value="purchase">{{ __('general_content.purchase_order_trans_key') }}</option>
                                            <option value="product">{{ __('general_content.products_trans_key') }}</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label for="category">{{ __('general_content.custom_fields_category_trans_key') }} :</label>
                                    <div class="input-group">
                                        <div class="input-group-prepend">
                                            <span class="input-group-text"><i class="fas fa-folder"></i></span>
                                        </div>
                                        <input type="text" class="form-control" id="category" name="category" placeholder="{{ __('general_content.custom_fields_category_placeholder_trans_key') }}">
                                    </div>
                                </div>
                                <div class="card-footer">
                                    <x-adminlte-button class="btn-flat" type="submit" label="{{ __('general_content.submit_trans_key') }}" theme="danger" icon="fas fa-lg fa-save"/>
                                </div>
                            </form>
                        </x-adminlte-card>
                    </div>
                    <!-- /.card secondary -->
                </div>
                <!-- /.row -->
            </div>
            <div class="tab-pane" id="DocumentCodeTemplates">
                <div class="row">
                    <div class="col-md-6">
                        <!-- Liste des modèles de code de documents -->
                        <x-adminlte-card title="{{ __('general_content.document_code_templates_trans_key') }}" theme="primary" maximizable>
                            <div class="table-responsive p-0">
                                <table class="table table-hover">
                                    <thead>
                                        <tr>
                                            <th>{{ __('general_content.entity_type_trans_key') }}</th>
                                            <th>{{ __('general_content.template_trans_key') }}</th>
                                            <th>{{ __('Reset') }}</th>
                                            <th>{{ __('Début exercice') }}</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @forelse ($DocumentCodeTemplates as $template)
                                            <tr>
                                                <td>{{ $template->document_type }}</td>
                                                <td><code>{{ $template->template }}</code></td>
                                                <td>{{ $template->reset_period ?? 'none' }}</td>
                                                <td>
                                                    @if(($template->reset_period ?? 'none') === 'yearly')
                                                        {{ \Carbon\Carbon::create()->month($template->yearly_reset_month ?? 1)->translatedFormat('F') }}
                                                        {{ $template->yearly_reset_day ?? 1 }}
                                                    @else
                                                        -
                                                    @endif
                                                </td>
                                                <td class=" py-0 align-middle">
                                                    <!-- Button Modal -->
                                                    <x-ButtonTextEdit :modalTarget="'Template' . $template->id" />
                                                    <!-- Modal {{ $template->id }} -->
                                                    <x-adminlte-modal id="Template{{ $template->id }}" title="Update {{ $template->label }}" theme="teal" icon="fa fa-pen" size='lg' disable-animations>
                                                        <form method="POST" action="{{ route('admin.document.code.template.update', ['id' => $template->id]) }}">
                                                            @csrf
                                                            <div class="card-body">
                                                                <div class="form-group">
                                                                    <label for="template">{{ __('general_content.template_trans_key') }} :</label>
                                                                    <div class="input-group">
                                                                        <div class="input-group-prepend">
                                                                            <span class="input-group-text"><i class="fas fa-code"></i></span>
                                                                        </div>
                                                                        <input type="text" class="form-control" id="template" name="template" placeholder="{dd}{mm}{yy}{id(2)}" value="{{ $template->template }}" required>
                                                                    </div>
                                                                    <small class="text-muted">
                                                                        {{ __('Date :') }} <code>{d}</code> <code>{dd}</code> <code>{m}</code> <code>{mm}</code> <code>{yy}</code> <code>{yyyy}</code> <code>{w}</code> <code>{ww}</code> {{ __('-
                                                                        ID :') }} <code>{id}</code> <code>{id(2)}</code> <code>{id(3)}</code> …
                                                                    </small>
                                                                </div>
                                                                <div class="form-group" x-data="{ period: '{{ $template->reset_period ?? 'none' }}' }">
                                                                    <label for="reset_period_{{ $template->id }}">{{ __('Reset :') }}</label>
                                                                    <select class="form-control" id="reset_period_{{ $template->id }}" name="reset_period" x-model="period" required>
                                                                        <option value="none">{{ __('None') }}</option>
                                                                        <option value="daily">{{ __('Daily') }}</option>
                                                                        <option value="weekly">{{ __('Weekly') }}</option>
                                                                        <option value="monthly">{{ __('Monthly') }}</option>
                                                                        <option value="yearly">{{ __('Yearly') }}</option>
                                                                    </select>
                                                                    <div x-show="period === 'yearly'" class="row mt-2">
                                                                        <div class="col-6">
                                                                            <label>{{ __('Mois de début d\'exercice') }}</label>
                                                                            <select class="form-control" name="yearly_reset_month">
                                                                                @foreach(range(1,12) as $m)
                                                                                    <option value="{{ $m }}" {{ (int)($template->yearly_reset_month ?? 1) === $m ? 'selected' : '' }}>
                                                                                        {{ Carbon\Carbon::create()->month($m)->translatedFormat('F') }}
                                                                                    </option>
                                                                                @endforeach
                                                                            </select>
                                                                        </div>
                                                                        <div class="col-6">
                                                                            <label>{{ __('Jour') }}</label>
                                                                            <input type="number" class="form-control" name="yearly_reset_day" min="1" max="31" value="{{ $template->yearly_reset_day ?? 1 }}">
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div class="card-footer">
                                                                <x-adminlte-button class="btn-flat" type="submit" label="{{ __('general_content.update_trans_key') }}" theme="info" icon="fas fa-lg fa-save"/>
                                                            </div>
                                                        </form>
                                                    </x-adminlte-modal>
                                                </td>
                                            </tr>
                                        @empty
                                            <x-EmptyDataLine col="3" text="{{ __('general_content.no_data_trans_key') }}" />
                                        @endforelse
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <th>{{ __('general_content.entity_type_trans_key') }}</th>
                                            <th>{{ __('general_content.template_trans_key') }}</th>
                                            <th>{{ __('Reset') }}</th>
                                            <th></th>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </x-adminlte-card>
                    </div>
            
                    <div class="col-md-6">
                        <!-- Formulaire de création d'un nouveau modèle de code de document -->
                        <x-adminlte-card title="{{ __('general_content.new_document_code_template_trans_key') }}" theme="secondary" maximizable>
                            <form method="POST" action="{{ route('admin.document.code.template.store') }}" class="form-horizontal">
                                @csrf
                                <div class="form-group">
                                    <label for="document_type">{{ __('general_content.entity_type_trans_key') }}  :</label>
                                    <div class="input-group">
                                        <div class="input-group-prepend">
                                            <span class="input-group-text"><i class="fas fa-list"></i></span>
                                        </div>
                                        <select class="form-control" id="document_type" name="document_type" required>
                                            <option value="company">{{ __('general_content.companies_trans_key') }}</option>
                                            <option value="quote">{{ __('general_content.quote_trans_key') }}</option>
                                            <option value="order">{{ __('general_content.orders_trans_key') }}</option>
                                            <option value="internal-order">{{ __('general_content.internal_order_trans_key') }}</option>
                                            <option value="delivery">{{ __('general_content.delivery_notes_trans_key') }}</option>
                                            <option value="invoice">{{ __('general_content.invoice_trans_key') }}</option>
                                            <option value="credit-note">{{ __('general_content.credit_note_trans_key') }}</option>
                                            <option value="purchase-quotation">{{ __('general_content.requests_for_quotation_list_trans_key') }}</option>
                                            <option value="purchase">{{ __('general_content.purchase_order_trans_key') }}</option>
                                            <option value="purchase-receipt">{{ __('general_content.po_receipt_trans_key') }}</option>
                                            <option value="purchase-invoice">{{ __('general_content.invoice_supplier_trans_key') }}</option>
                                            <option value="action">{{ __('general_content.corrective_actions_class_trans_key') }}</option>
                                            <option value="derogation">{{ __('general_content.derogations_trans_key') }}</option>
                                            <option value="non-conformities">{{ __('general_content.non_conformities_trans_key') }}</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label for="template">{{ __('general_content.template_trans_key') }} :</label>
                                    <div class="input-group">
                                        <div class="input-group-prepend">
                                            <span class="input-group-text"><i class="fas fa-code"></i></span>
                                        </div>
                                        <input type="text" class="form-control" id="template" name="template" placeholder="{dd}{mm}{yy}{id(2)}" required>
                                    </div>
                                    <small class="text-muted">
                                        {{ __('Date :') }} <code>{d}</code> <code>{dd}</code> <code>{m}</code> <code>{mm}</code> <code>{yy}</code> <code>{yyyy}</code> <code>{w}</code> <code>{ww}</code> {{ __('-
                                        ID :') }} <code>{id}</code> <code>{id(2)}</code> <code>{id(3)}</code> …
                                    </small>
                                </div>
                                <div class="form-group" x-data="{ period: 'none' }">
                                    <label for="reset_period">{{ __('Reset :') }}</label>
                                    <div class="input-group">
                                        <div class="input-group-prepend">
                                            <span class="input-group-text"><i class="fas fa-redo"></i></span>
                                        </div>
                                        <select class="form-control" id="reset_period" name="reset_period" x-model="period" required>
                                            <option value="none">{{ __('None') }}</option>
                                            <option value="daily">{{ __('Daily') }}</option>
                                            <option value="weekly">{{ __('Weekly') }}</option>
                                            <option value="monthly">{{ __('Monthly') }}</option>
                                            <option value="yearly">{{ __('Yearly') }}</option>
                                        </select>
                                    </div>
                                    <div x-show="period === 'yearly'" class="row mt-2">
                                        <div class="col-6">
                                            <label>{{ __('Mois de début d\'exercice') }}</label>
                                            <select class="form-control" name="yearly_reset_month">
                                                @foreach(range(1,12) as $m)
                                                    <option value="{{ $m }}">
                                                        {{ Carbon\Carbon::create()->month($m)->translatedFormat('F') }}
                                                    </option>
                                                @endforeach
                                            </select>
                                        </div>
                                        <div class="col-6">
                                            <label>{{ __('Jour') }}</label>
                                            <input type="number" class="form-control" name="yearly_reset_day" min="1" max="31" value="1">
                                        </div>
                                    </div>
                                </div>

                                <div class="card-footer">
                                    <x-adminlte-button class="btn-flat" type="submit" label="{{ __('general_content.submit_trans_key') }}" theme="danger" icon="fas fa-lg fa-save"/>
                                </div>
                            </form>
                        </x-adminlte-card>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
@stop


@section('css')
@stop

@section('js')
<script>
    document.addEventListener('DOMContentLoaded', function () {
        const typeSelect = document.getElementById('custom_field_type');
        const optionsGroup = document.getElementById('custom-field-options-group');
        const optionsInput = document.getElementById('options');

        if (!typeSelect || !optionsGroup || !optionsInput) {
            return;
        }

        const toggleOptionsVisibility = () => {
            const shouldShowOptions = typeSelect.value === 'select';
            optionsGroup.style.display = shouldShowOptions ? 'block' : 'none';
            optionsInput.required = shouldShowOptions;
        };

        typeSelect.addEventListener('change', toggleOptionsVisibility);
        toggleOptionsVisibility();
    });
</script>
@stop
